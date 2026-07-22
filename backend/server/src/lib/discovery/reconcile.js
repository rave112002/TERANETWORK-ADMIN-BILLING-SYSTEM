/**
 * Discovery reconciliation engine.
 * ================================
 *
 * Pure function: given what the DEVICES report (OLT ONUs + MikroTik accounts &
 * sessions) and what's already in OUR DATABASE, sort every record into three
 * buckets and attach suggestions. It writes nothing — the caller stages the
 * result in `discovered_items` and staff decide what to import.
 *
 *   matched  - device record already exists in our system  → snapshot only
 *   new      - on a device, not in our system              → candidate to import
 *   orphaned - in our system, not seen on the device       → flag (never delete)
 *
 * The MAC is the join key: an ONU's MAC (OLT) equals the caller-id MAC of that
 * subscriber's PPPoE session (MikroTik), which lets us suggest modem↔account
 * links. All MACs are normalised before comparison.
 *
 * KEPT PURE ON PURPOSE: the caller fetches the DB-side arrays and passes them
 * in, so this whole thing is testable with zero DB/hardware.
 */

import { normalizeMac, parseOnuDescription, buildSessionMacIndex } from "./reconcile.helpers.js";

/**
 * @typedef {Object} DiscoveredItem
 * @property {'olt'|'mikrotik'} source
 * @property {string} external_key      - the MAC (ONU) or username (account).
 * @property {Object} raw               - the original device record.
 * @property {Object|null} suggested    - parsed hints / linked account, or null.
 * @property {'matched'|'new'|'orphaned'} match_status
 * @property {string|null} matched_entity - 'onu' | 'subscription' | null.
 * @property {number|null} matched_id
 */

/**
 * @param {Object} input
 * @param {Array} [input.oltOnus]   - parsed ONUs from the OLT (listOnus).
 * @param {Array} [input.accounts]  - PPPoE secrets from the MikroTik.
 * @param {Array} [input.sessions]  - active PPPoE sessions from the MikroTik.
 * @param {Object} [input.existing] - our DB snapshot.
 * @param {Array} [input.existing.onus] - [{ id, mac, serial_no }].
 * @param {Array} [input.existing.subscriptions] - [{ id, onu_id }].
 * @returns {{ items: DiscoveredItem[], summary: { matched: number, new: number, orphaned: number } }}
 */
export const reconcile = ({ oltOnus = [], accounts = [], sessions = [], existing = {} } = {}) => {
  const existingOnus = existing.onus ?? [];
  const existingSubs = existing.subscriptions ?? [];

  // Session → MAC maps (the modem↔account join).
  const { macToSession, usernameToMac } = buildSessionMacIndex(sessions);
  const accountsByUsername = new Map(accounts.map((a) => [a.username, a]));

  // Our DB, indexed for fast lookup.
  const existingOnuByMac = new Map();
  for (const o of existingOnus) {
    const m = normalizeMac(o.mac);
    if (m) existingOnuByMac.set(m, o);
  }
  const subByOnuId = new Map(existingSubs.map((s) => [s.onu_id, s]));

  const items = [];
  const discoveredOltMacs = new Set();

  // ── 1) ONUs from the OLT ────────────────────────────────────────────────
  for (const onu of oltOnus) {
    const mac = normalizeMac(onu.mac);
    if (mac) discoveredOltMacs.add(mac);

    const existingOnu = mac ? existingOnuByMac.get(mac) : undefined;
    if (existingOnu) {
      items.push({
        source: "olt",
        external_key: mac ?? onu.onuIndex ?? "",
        raw: onu,
        suggested: null,
        match_status: "matched",
        matched_entity: "onu",
        matched_id: existingOnu.id,
      });
    } else {
      // New modem → suggest name/NAP/port from the description, and the linked
      // account/plan if a session's caller-id matches this MAC.
      const session = mac ? macToSession.get(mac) : undefined;
      const account = session ? accountsByUsername.get(session.username) : undefined;
      items.push({
        source: "olt",
        external_key: mac ?? onu.onuIndex ?? "",
        raw: onu,
        suggested: {
          ...parseOnuDescription(onu.description),
          onuIndex: onu.onuIndex ?? null,
          account: account
            ? { username: account.username, profile: account.profile }
            : session
              ? { username: session.username, profile: null }
              : null,
        },
        match_status: "new",
        matched_entity: null,
        matched_id: null,
      });
    }
  }

  // ── 2) Accounts from the MikroTik ───────────────────────────────────────
  for (const account of accounts) {
    const mac = usernameToMac.get(account.username) ?? null;
    const existingOnu = mac ? existingOnuByMac.get(mac) : undefined;

    if (existingOnu) {
      // We already know this subscriber's modem; link to their subscription if any.
      const sub = subByOnuId.get(existingOnu.id);
      items.push({
        source: "mikrotik",
        external_key: account.username,
        raw: account,
        suggested: null,
        match_status: "matched",
        matched_entity: sub ? "subscription" : "onu",
        matched_id: sub ? sub.id : existingOnu.id,
      });
    } else {
      items.push({
        source: "mikrotik",
        external_key: account.username,
        raw: account,
        suggested: {
          username: account.username,
          profile: account.profile,
          disabled: account.disabled,
          comment: account.comment ?? null,
          mac, // may be null if the account has no active session
        },
        match_status: "new",
        matched_entity: null,
        matched_id: null,
      });
    }
  }

  // ── 3) Orphans: ONUs in our DB the OLT no longer reports ────────────────
  // Only meaningful when we actually swept the OLT (oltOnus present); otherwise
  // we'd wrongly flag everything as orphaned on a MikroTik-only run.
  if (oltOnus.length > 0) {
    for (const o of existingOnus) {
      const m = normalizeMac(o.mac);
      if (!m || !discoveredOltMacs.has(m)) {
        items.push({
          source: "olt",
          external_key: m ?? String(o.id),
          raw: { id: o.id, mac: o.mac, serial_no: o.serial_no },
          suggested: null,
          match_status: "orphaned",
          matched_entity: "onu",
          matched_id: o.id,
        });
      }
    }
  }

  // Tally for the run summary / UI badges.
  const summary = { matched: 0, new: 0, orphaned: 0 };
  for (const it of items) summary[it.match_status] += 1;

  return { items, summary };
};

export default reconcile;
