/**
 * MockMikroTikClient — a fake RouterOS device, in memory.
 * =======================================================
 *
 * Implements the read-only MikroTik contract with seeded PPPoE secrets +
 * active sessions, so the whole Device Discovery → reconcile → import flow is
 * testable without a real router.
 *
 * The seed deliberately DOVETAILS with the MockOltDriver's ONUs so the MAC join
 * key works end-to-end:
 *   - session caller-id "30:C5:0F:D8:7F:2C" matches mock ONU 1/27
 *   - session caller-id "48:57:02:11:22:33" matches mock ONU 1/5
 * Note the caller-id MACs are UPPERCASE here (as RouterOS often reports them)
 * while the OLT reports lowercase — reconciliation must normalise case.
 *
 * It also includes edge cases for the reconciler:
 *   - an account with NO active session (can't learn its MAC from a session)
 *   - later, an ONU with no account will show up as 'new'/'orphaned' depending
 *     on direction — exercised in the reconciliation step.
 */

import { MikroTikClient } from "./client.interface.js";

const seed = () => ({
  secrets: [
    { username: "jacqueline", profile: "Fiber-50Mbps", disabled: false, comment: "Jacqueline Rebancos" },
    { username: "testcust", profile: "Fiber-100Mbps", disabled: true, comment: "Test Customer" },
    { username: "noc-standby", profile: "Fiber-20Mbps", disabled: false, comment: "Account with no active session" },
  ],
  sessions: [
    { username: "jacqueline", callerId: "30:C5:0F:D8:7F:2C", address: "100.64.0.10", uptime: "5d3h20m" },
    { username: "testcust", callerId: "48:57:02:11:22:33", address: "100.64.0.11", uptime: "1h2m" },
  ],
});

export class MockMikroTikClient extends MikroTikClient {
  /**
   * @param {Object} [options]
   * @param {number} [options.latencyMs]
   * @param {{ secrets: Array, sessions: Array }} [options.data] - inject state (tests).
   */
  constructor(options = {}) {
    super();
    this.kind = "mock";
    this.latencyMs = options.latencyMs ?? Number(process.env.MOCK_MIKROTIK_LATENCY_MS ?? 30);
    this.data = options.data ?? seed();
  }

  async _delay() {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
  }

  /** @returns {Promise<import('./client.interface.js').PppoeSecret[]>} */
  async listPppoeSecrets() {
    await this._delay();
    // Return copies so callers can't mutate our in-memory seed.
    return this.data.secrets.map((s) => ({ ...s }));
  }

  /** @returns {Promise<import('./client.interface.js').PppoeSession[]>} */
  async listActiveSessions() {
    await this._delay();
    return this.data.sessions.map((s) => ({ ...s }));
  }
}

export default MockMikroTikClient;
