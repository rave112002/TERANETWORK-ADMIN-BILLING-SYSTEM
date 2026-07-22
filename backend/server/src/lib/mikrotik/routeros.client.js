/**
 * RouterOsClient — the REAL MikroTik client (STUB for now).
 * =========================================================
 *
 * Talks to a live MikroTik over the RouterOS API to read PPPoE secrets and
 * active sessions. It is intentionally NOT implemented yet because it needs a
 * new dependency (`node-routeros`, or the REST API on newer RouterOS), which we
 * add deliberately only when we're ready to point at a real router.
 *
 * When we implement it (a later, flagged step):
 *   - connect()  -> open RouterOS API session (host, port 8728/8729, user, pass)
 *   - listPppoeSecrets()   -> `/ppp/secret/print`  -> map to PppoeSecret[]
 *   - listActiveSessions() -> `/ppp/active/print`  -> map to PppoeSession[]
 *   - close()    -> close the session
 * Read-only: never call any `set`/`add`/`remove`.
 *
 * Until then it throws a clear, honest error rather than pretending to work.
 * The MockMikroTikClient covers all development and testing.
 */

import { MikroTikClient } from "./client.interface.js";
import APIError from "../../utils/APIError.js";

export class RouterOsClient extends MikroTikClient {
  /**
   * @param {Object} config - { host, port, username, password }.
   */
  constructor(config = {}) {
    super();
    this.kind = "routeros";
    this.config = config;
  }

  async connect() {
    throw new APIError(
      "RouterOsClient is not implemented yet (needs the node-routeros dependency). Use the mock for now.",
      501,
      "NOT_IMPLEMENTED"
    );
  }
}

export default RouterOsClient;
