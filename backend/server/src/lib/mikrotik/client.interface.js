/**
 * MikroTik client contract (read-only, for Device Discovery §3.1.1).
 * ==================================================================
 *
 * The OLT knows the modems (ONUs); the MikroTik router knows the customer
 * ACCOUNTS. To onboard the prior ISP's data we read two things from the router
 * over the RouterOS API (the same channel WinBox uses):
 *
 *   listPppoeSecrets()   -> the account list (username, plan/profile, enabled…)
 *   listActiveSessions() -> who's online now (username, caller-id MAC, IP, uptime)
 *
 * The caller-id MAC on an active session is the SAME MAC the OLT reports for
 * that subscriber's ONU — that's our join key linking modem ↔ account.
 *
 * READ-ONLY: this layer never writes to the router. Like the OLT drivers, real
 * and mock implementations sit behind this one shape so the whole discovery flow
 * is testable with no hardware.
 */

/**
 * A PPPoE "secret" = one customer account as stored on the router.
 * @typedef {Object} PppoeSecret
 * @property {string} username
 * @property {string} profile   - the RouterOS profile ≈ the service plan/speed tier.
 * @property {boolean} disabled  - true if the account is administratively disabled.
 * @property {string} [comment]  - free-text (often the customer's name).
 */

/**
 * An active PPPoE session = one subscriber online right now.
 * @typedef {Object} PppoeSession
 * @property {string} username
 * @property {string} callerId - the CPE/ONU MAC (join key to the OLT's ONU).
 * @property {string} [address] - assigned IP.
 * @property {string} [uptime]  - how long they've been connected, e.g. "5d3h".
 */

/**
 * Abstract base. Real drivers extend this and override the two list methods.
 * connect()/close() default to no-ops so the mock (which needs neither) works
 * without overriding them.
 */
export class MikroTikClient {
  /** @type {string} */
  kind = "abstract";

  /** Open the connection (real client only). @returns {Promise<void>} */
  async connect() {}

  /** Close the connection (real client only). @returns {Promise<void>} */
  async close() {}

  /**
   * List all PPPoE secrets (accounts).
   * @returns {Promise<PppoeSecret[]>}
   */
  async listPppoeSecrets() {
    throw new Error(`${this.kind}: listPppoeSecrets() is not implemented`);
  }

  /**
   * List active PPPoE sessions (who's online now).
   * @returns {Promise<PppoeSession[]>}
   */
  async listActiveSessions() {
    throw new Error(`${this.kind}: listActiveSessions() is not implemented`);
  }
}

export default MikroTikClient;
