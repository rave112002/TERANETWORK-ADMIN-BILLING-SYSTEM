/**
 * Discovery reconciliation — pure helper functions.
 * =================================================
 *
 * Small, side-effect-free building blocks the reconciler uses. Keeping them
 * separate means we can unit-test the fiddly parsing/normalising on its own.
 *
 *   normalizeMac()        - turn any MAC spelling into one canonical form
 *   parseOnuDescription() - pull name/NAP/port hints out of the ONU free-text
 *   buildSessionMacIndex()- map "which MAC belongs to which PPPoE session"
 */

/**
 * Canonicalise a MAC address to lowercase colon-separated form.
 *
 * Devices spell MACs differently: the MikroTik reports "30:C5:0F:D8:7F:2C"
 * (upper), the OLT "30:c5:0f:d8:7f:2c" (lower), and some gear uses dashes or
 * dots. To compare them we strip everything but hex digits, require exactly 12,
 * and re-group into pairs. Returns null for anything that isn't a valid MAC.
 *
 * @param {string} mac
 * @returns {string|null} e.g. "30:c5:0f:d8:7f:2c", or null if invalid.
 *
 * @example
 *   normalizeMac("30:C5:0F:D8:7F:2C") // "30:c5:0f:d8:7f:2c"
 *   normalizeMac("30-c5-0f-d8-7f-2c") // "30:c5:0f:d8:7f:2c"
 *   normalizeMac("30c5.0fd8.7f2c")    // "30:c5:0f:d8:7f:2c"
 *   normalizeMac("not-a-mac")         // null
 */
export const normalizeMac = (mac) => {
  if (typeof mac !== "string") return null;
  const hex = mac.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(":");
};

/**
 * Parse the prior ISP's ONU description free-text into structured hints.
 *
 * The old deployment stored things like:
 *   "Jacqueline-Rebancos PON 2 NAP 1 PORT 5"
 * We extract a suggested customer name plus PON/NAP/PORT numbers so staff get a
 * pre-filled (editable) import form. Everything is a best-effort SUGGESTION; if
 * a piece isn't found it comes back null.
 *
 * @param {string} description
 * @returns {{ name: string|null, pon: number|null, nap: number|null, port: number|null, raw: string }}
 *
 * @example
 *   parseOnuDescription("Jacqueline-Rebancos PON 2 NAP 1 PORT 5")
 *   // { name: "Jacqueline-Rebancos", pon: 2, nap: 1, port: 5, raw: "..." }
 */
export const parseOnuDescription = (description) => {
  const raw = typeof description === "string" ? description.trim() : "";
  const empty = { name: null, pon: null, nap: null, port: null, raw };
  if (!raw) return empty;

  const num = (re) => {
    const m = raw.match(re);
    return m ? Number(m[1]) : null;
  };

  const pon = num(/\bPON\s*[:#-]?\s*(\d+)/i);
  const nap = num(/\bNAP\s*[:#-]?\s*(\d+)/i);
  const port = num(/\bPORT\s*[:#-]?\s*(\d+)/i);

  // Name = whatever comes before the first location keyword. We match the
  // keyword+number pattern (leading \b avoids false hits inside words like
  // "Newport", but no trailing \b so "pon2" with no space still splits).
  const locRe = /\b(?:PON|NAP|PORT|FAT|FDB)\s*[:#-]?\s*\d+/i;
  const firstLoc = raw.search(locRe);
  const beforeKeyword = firstLoc >= 0 ? raw.slice(0, firstLoc) : raw;
  // Strip trailing separators left behind (e.g. a dangling "-" or ",").
  const name = beforeKeyword.replace(/[\s,;:-]+$/, "").trim() || null;

  return { name, pon, nap, port, raw };
};

/**
 * Build lookup maps from active PPPoE sessions so the reconciler can answer
 * "which account owns this MAC?" and "what MAC is this user on?".
 *
 * Sessions with a missing/invalid caller-id MAC are skipped (we simply can't
 * join them by MAC). Case is normalised via normalizeMac.
 *
 * @param {import('../mikrotik/client.interface.js').PppoeSession[]} sessions
 * @returns {{ macToSession: Map<string, Object>, usernameToMac: Map<string, string> }}
 */
export const buildSessionMacIndex = (sessions = []) => {
  const macToSession = new Map();
  const usernameToMac = new Map();

  for (const session of sessions) {
    const mac = normalizeMac(session.callerId);
    if (!mac) continue; // no usable MAC → can't join this session
    macToSession.set(mac, { ...session, mac });
    if (session.username) {
      usernameToMac.set(session.username, mac);
    }
  }

  return { macToSession, usernameToMac };
};

export default { normalizeMac, parseOnuDescription, buildSessionMacIndex };
