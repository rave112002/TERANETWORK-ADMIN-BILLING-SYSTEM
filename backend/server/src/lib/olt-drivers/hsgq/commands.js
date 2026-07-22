/**
 * HSGQ XE04I — CLI command builders (pure, no network).
 * =====================================================
 *
 * These functions turn "deactivate ONU 1/27" into the exact CLI lines we'll send
 * the OLT. They're pure string-builders: no sockets, no side effects, trivially
 * unit-testable. The telnet/ssh transport (built in a later step) handles the
 * NAVIGATION around them (login -> enable -> configure -> interface epon N).
 *
 * Source of truth for syntax: docs/HSGQ_DOCUMENTATION.md (the lab bench). The
 * device is a BDCOM-derived HSGQ XE04I running EPON.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ⚠  COMMAND SYNTAX IS A LAB-VERIFY CANDIDATE.                              │
 * │ The doc lists the command NAMES (blacklist / onu-deregister /            │
 * │ onu-authorize) and confirms the navigation, but the exact argument form  │
 * │ (e.g. `blacklist add mac <MAC>`) must be confirmed on the XE04I bench     │
 * │ before we ever run this against real hardware. Until then it stays behind │
 * │ the mock + DRY_RUN.                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY blacklist AND deregister for a suspend: the doc's alarm history shows a
 * bare `onu-deregister` re-registers via MPCP within ~33 seconds. The blacklist
 * is what actually HOLDS the ONU down. So suspend = blacklist + deregister;
 * reconnect = un-blacklist + authorize.
 */

import APIError from "../../../utils/APIError.js";

/**
 * Split a vendor ONU index like "1/27" into its parts.
 * @param {string} onuIndex - "pon/onuId", e.g. "1/27".
 * @returns {{ pon: string, onuId: string }}
 * @throws {APIError} if the format isn't "<pon>/<onuId>".
 *
 * @example parseOnuIndex("1/27") // -> { pon: "1", onuId: "27" }
 */
export const parseOnuIndex = (onuIndex) => {
  if (typeof onuIndex !== "string" || !/^\d+\/\d+$/.test(onuIndex.trim())) {
    throw new APIError(`Invalid HSGQ onuIndex '${onuIndex}' (expected 'pon/onuId', e.g. '1/27')`, 400);
  }
  const [pon, onuId] = onuIndex.trim().split("/");
  return { pon, onuId };
};

/**
 * A "command plan" the transport executes: enter `interface epon <pon>`, run the
 * `commands` in order, then (if `save`) persist config. Keeping this structured
 * (rather than one big string) lets the transport handle prompts/navigation and
 * lets tests assert on exact lines.
 *
 * @typedef {Object} CommandPlan
 * @property {string} interface - e.g. "epon 1" (the interface to enter).
 * @property {string[]} commands - CLI lines to run inside that interface.
 * @property {boolean} save - whether to persist config afterwards.
 */

/**
 * Build the suspend (deactivate) command plan.
 * @param {{ onuIndex: string, mac: string }} args
 * @returns {CommandPlan}
 *
 * @example
 *   buildDeactivate({ onuIndex: "1/27", mac: "30:c5:0f:d8:7f:2c" })
 *   // {
 *   //   interface: "epon 1",
 *   //   commands: ["blacklist add mac 30:c5:0f:d8:7f:2c", "onu-deregister 27"],
 *   //   save: true,
 *   // }
 */
export const buildDeactivate = ({ onuIndex, mac }) => {
  const { pon, onuId } = parseOnuIndex(onuIndex);
  if (!mac) {
    throw new APIError("HSGQ deactivate requires the ONU MAC (blacklist is by MAC)", 400);
  }
  return {
    interface: `epon ${pon}`,
    commands: [`blacklist add mac ${mac}`, `onu-deregister ${onuId}`],
    save: true, // verify on bench whether blacklist survives reboot without save
  };
};

/**
 * Build the reconnect (activate) command plan.
 * @param {{ onuIndex: string, mac: string }} args
 * @returns {CommandPlan}
 */
export const buildActivate = ({ onuIndex, mac }) => {
  const { pon, onuId } = parseOnuIndex(onuIndex);
  if (!mac) {
    throw new APIError("HSGQ activate requires the ONU MAC (to remove from blacklist)", 400);
  }
  return {
    interface: `epon ${pon}`,
    commands: [`blacklist del mac ${mac}`, `onu-authorize ${onuId}`],
    save: true,
  };
};

/**
 * Build the status-read command plan (one ONU): basic info + optical Rx.
 * These are `show` commands — recall the doc quirk: on the XE04I most `show`
 * commands only work inside config/interface mode, not plain enable mode.
 * @param {{ onuIndex: string }} args
 * @returns {CommandPlan}
 */
export const buildStatus = ({ onuIndex }) => {
  const { pon, onuId } = parseOnuIndex(onuIndex);
  return {
    interface: `epon ${pon}`,
    commands: [`show onu-info ${onuId}`, `show optical-rssi ${onuId}`],
    save: false, // read-only
  };
};

/**
 * Build the "list all ONUs on a PON" command plan (used by Discovery).
 * @param {{ ponPortIndex: string }} args - the PON number, e.g. "1".
 * @returns {CommandPlan}
 */
export const buildListOnus = ({ ponPortIndex }) => {
  if (ponPortIndex === undefined || ponPortIndex === null || `${ponPortIndex}` === "") {
    throw new APIError("HSGQ listOnus requires a ponPortIndex (which EPON port to sweep)", 400);
  }
  return {
    interface: `epon ${ponPortIndex}`,
    commands: ["show onu-info all"],
    save: false,
  };
};

export default { parseOnuIndex, buildDeactivate, buildActivate, buildStatus, buildListOnus };
