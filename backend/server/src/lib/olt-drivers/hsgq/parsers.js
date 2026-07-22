/**
 * HSGQ XE04I — CLI output parsers (pure, no network).
 * ===================================================
 *
 * Turn the raw text the OLT prints back into structured JS objects. Pure
 * functions: give them a string, get data — easy to unit-test against captured
 * transcripts.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ⚠  OUTPUT FORMAT IS PROVISIONAL.                                          │
 * │ HSGQ_DOCUMENTATION.md lists the FIELDS but not a raw `show onu-info all`  │
 * │ dump. These parsers are written against an ASSUMED column layout (see     │
 * │ docs/vendor-transcripts/hsgq-xe04i/show-onu-info-all.sample.txt). Capture  │
 * │ real bench output and adjust before trusting in production.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Design principle: be TOLERANT. Skip prompt echoes, headers, separators and
 * blank lines; only accept lines that clearly look like data. A parser that
 * silently mis-reads a device is dangerous, so when a line doesn't match the
 * expected shape we skip it rather than guess.
 */

// A MAC like 30:c5:0f:d8:7f:2c (six hex pairs, colon-separated).
const MAC_RE = "[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}";

// One data row of `show onu-info all`:
//   <onuId>  <mac>  <auth>  <config>  <status>  <description...>
// Description is optional and may contain spaces, so it's the greedy tail.
const ONU_ROW_RE = new RegExp(
  `^\\s*(\\d+)\\s+(${MAC_RE})\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s*(.*?)\\s*$`
);

/**
 * Parse `show onu-info all` output (run inside `interface epon <pon>`).
 *
 * @param {string} raw - the raw device output.
 * @param {string|number} pon - which EPON port this was run on (for onuIndex).
 * @returns {Array<{
 *   onuIndex: string, onuId: string, mac: string,
 *   auth: boolean, config: boolean, online: boolean, description: string
 * }>}
 *
 * @example
 *   parseOnuInfoAll(text, 1)
 *   // [{ onuIndex: "1/27", onuId: "27", mac: "30:c5:0f:d8:7f:2c",
 *   //    auth: true, config: true, online: true, description: "Jacqueline-..." }]
 */
export const parseOnuInfoAll = (raw, pon) => {
  const records = [];
  for (const line of String(raw).split(/\r?\n/)) {
    // Skip obvious non-data lines fast.
    if (!line.trim()) continue;
    if (line.includes("#") || line.includes(">")) continue; // prompt/command echo
    if (/^[\s|-]+$/.test(line)) continue; // separator row (---- ----)

    const m = line.match(ONU_ROW_RE);
    if (!m) continue; // header ("ONU MAC-Address ...") and anything odd: skip

    const [, onuId, mac, auth, config, status, description] = m;
    records.push({
      onuIndex: `${pon}/${onuId}`,
      onuId,
      mac: mac.toLowerCase(),
      auth: auth.toUpperCase() === "TRUE",
      config: config.toUpperCase() === "TRUE",
      online: status.toLowerCase() === "online",
      description: description.trim(),
    });
  }
  return records;
};

/**
 * Best-effort parse of `show optical-rssi <id>` into Rx/Tx dBm.
 *
 * The exact layout is unconfirmed, so we scan for "RX ... <number> dBm" and
 * "TX ... <number> dBm" rather than assume fixed columns. Returns nulls for
 * anything we can't find (never a wrong number).
 *
 * @param {string} raw
 * @returns {{ rxDbm: number|null, txDbm: number|null }}
 */
export const parseOpticalRssi = (raw) => {
  const text = String(raw);
  const find = (label) => {
    // e.g. "RX Power : -16.07 dBm"  or  "Rx power -16.07dBm"
    const re = new RegExp(`${label}[^\\-\\d]*(-?\\d+(?:\\.\\d+)?)\\s*dbm`, "i");
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  return { rxDbm: find("RX"), txDbm: find("TX") };
};

/**
 * Parse a single-ONU `show onu-info <id>` into online/auth flags, tolerant of
 * "Key : Value" style lines. Provisional — adjust to real bench output.
 *
 * @param {string} raw
 * @returns {{ online: boolean|null, auth: boolean|null, config: boolean|null }}
 */
export const parseOnuInfoOne = (raw) => {
  const text = String(raw);
  const flag = (label) => {
    const m = text.match(new RegExp(`${label}[^:]*:\\s*(\\S+)`, "i"));
    if (!m) return null;
    const v = m[1].toLowerCase();
    return v === "true" || v === "online" || v === "up";
  };
  return {
    online: flag("online"),
    auth: flag("auth"),
    config: flag("config"),
  };
};

export default { parseOnuInfoAll, parseOpticalRssi, parseOnuInfoOne };
