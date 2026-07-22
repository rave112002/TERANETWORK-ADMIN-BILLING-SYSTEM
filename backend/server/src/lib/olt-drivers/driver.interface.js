/**
 * OLT Driver Contract (the "wall socket" every vendor driver must fit)
 * ===================================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every OLT brand (HSGQ, Huawei, ZTE, ...) speaks a different command language.
 * We do NOT want our billing / dunning code to know those differences. So we
 * define ONE shared shape here — four methods — that every driver must provide.
 * The rest of the system only ever calls these four methods and never cares
 * which brand is on the other end.
 *
 *   activateOnu(ctx)    -> turn a subscriber's ONU (modem) ON at the OLT
 *   deactivateOnu(ctx)  -> turn it OFF (suspend — never delete; reconnect must be instant)
 *   getOnuStatus(ctx)   -> read one ONU's live state (online?, optical signal)
 *   listOnus(ctx)       -> list all ONUs the OLT can see (used later by Discovery)
 *
 * JavaScript has no "interface" keyword like TypeScript, so we express the
 * contract two ways:
 *   1. JSDoc @typedef blocks below describe the exact shape of the inputs
 *      (OltContext) and outputs (DriverResult). Editors use these for hints.
 *   2. An abstract base class `OltDriver` whose four methods throw
 *      "not implemented". Real drivers `extends OltDriver` and override them,
 *      so we get a clear, early error if a driver forgets one.
 *
 * This file has NO device logic of its own. It is purely the agreed-upon shape.
 */

/**
 * Everything a driver needs to act on ONE ONU (or, for listOnus, one PON port).
 *
 * The caller (the provisioning worker) builds this by looking up the ONU in the
 * database, finding its parent OLT, and decrypting that OLT's credentials.
 *
 * @typedef {Object} OltContext
 * @property {string} host        - OLT management IP/hostname, e.g. "192.168.88.10".
 * @property {number} port        - Management port (telnet 23, ssh 22, ...).
 * @property {"ssh"|"telnet"|"snmp"|"tr069"} protocol - How we talk to this OLT.
 * @property {OltCredentials} credentials - DECRYPTED login secrets (never logged).
 * @property {string} [ponPortIndex] - Vendor PON port id, e.g. "0/1/3" or "1".
 * @property {string} [onuIndex]     - Vendor ONU id on that PON, e.g. "1/27".
 * @property {string} [serialNo]     - ONU serial (inventory label).
 * @property {string} [mac]          - ONU MAC address. On EPON (HSGQ) this is the
 *                                     PRIMARY identifier, not the serial.
 *
 * @example
 * // What one context object actually looks like at runtime:
 * // {
 * //   host: "192.168.88.10",
 * //   port: 23,
 * //   protocol: "telnet",
 * //   credentials: { username: "root", password: "***", enablePassword: "***" },
 * //   ponPortIndex: "1",
 * //   onuIndex: "1/27",
 * //   serialNo: "HWTC12345678",
 * //   mac: "30:c5:0f:d8:7f:2c"
 * // }
 */

/**
 * The decrypted secret bundle for one OLT. Matches what the OLT credential
 * form stores (see olts.controller.js `credentialsSchema`).
 *
 * @typedef {Object} OltCredentials
 * @property {string} username
 * @property {string} password
 * @property {string} [enablePassword] - Some CLIs need a second "enable" password.
 */

/**
 * The standard result EVERY driver method returns — success or failure.
 *
 * We ALWAYS return this shape (rather than throwing) for expected device
 * outcomes, because the worker writes `command` + `rawResponse` verbatim into
 * the `network_action_logs` audit table. Auditability is non-negotiable: we
 * must be able to prove exactly what we sent the device and what it said back.
 *
 * @typedef {Object} DriverResult
 * @property {boolean} success   - Did the intended action succeed?
 * @property {string}  command   - The exact command(s) we sent (for the audit log).
 * @property {string}  rawResponse - The raw text the device sent back (verbatim).
 * @property {Object=} parsed    - Optional structured data parsed from rawResponse
 *                                 (e.g. { online: true, rxDbm: -21.5 }).
 * @property {string=} error     - Human-readable reason when success === false.
 *
 * @example
 * // A successful deactivate:
 * // {
 * //   success: true,
 * //   command: "onu-deregister 1/27\nsave",
 * //   rawResponse: "ONU 1/27 deregistered\nConfiguration saved",
 * //   parsed: { deregistered: true }
 * // }
 */

/**
 * Abstract base class for all OLT drivers.
 *
 * Real drivers extend this and override all four methods. If a driver forgets
 * one, calling it throws a clear "not implemented" error instead of failing in
 * some confusing way deep inside the worker.
 *
 * Each method is `async` because talking to a device is slow (network I/O):
 * we open a session, send text, and wait for the device to reply.
 *
 * @example
 *   class MockOltDriver extends OltDriver {
 *     async deactivateOnu(ctx) {  ...return a DriverResult...  }
 *     // ...override the other three too
 *   }
 */
export class OltDriver {
  /**
   * A short label for logs, e.g. "mock" or "hsgq". Subclasses set this.
   * @type {string}
   */
  vendor = "abstract";

  /**
   * Turn an ONU ON at the OLT (reconnect a paying customer).
   * @param {OltContext} _ctx
   * @returns {Promise<DriverResult>}
   */
  async activateOnu(_ctx) {
    throw new Error(`${this.vendor}: activateOnu() is not implemented`);
  }

  /**
   * Turn an ONU OFF at the OLT (suspend a non-payer). Must SUSPEND, not delete,
   * so reconnection on payment is instant.
   * @param {OltContext} _ctx
   * @returns {Promise<DriverResult>}
   */
  async deactivateOnu(_ctx) {
    throw new Error(`${this.vendor}: deactivateOnu() is not implemented`);
  }

  /**
   * Read one ONU's live state from the OLT (online?, optical Rx/Tx dBm).
   * @param {OltContext} _ctx
   * @returns {Promise<DriverResult>}
   */
  async getOnuStatus(_ctx) {
    throw new Error(`${this.vendor}: getOnuStatus() is not implemented`);
  }

  /**
   * List every ONU the OLT can see (optionally scoped to one PON port via
   * ctx.ponPortIndex). Used later by Device Discovery to import existing modems.
   * @param {OltContext} _ctx
   * @returns {Promise<DriverResult & { parsed?: Array<Object> }>}
   */
  async listOnus(_ctx) {
    throw new Error(`${this.vendor}: listOnus() is not implemented`);
  }
}

export default OltDriver;
