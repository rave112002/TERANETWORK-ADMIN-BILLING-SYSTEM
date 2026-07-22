/**
 * MikroTik clients — public entry point + resolver.
 * =================================================
 *
 * Mirrors the olt-drivers pattern: callers use resolveMikroTikClient(config) to
 * get the right client instead of hand-picking a class.
 */

import { MikroTikClient } from "./client.interface.js";
import { MockMikroTikClient } from "./mock.client.js";
import { RouterOsClient } from "./routeros.client.js";
import APIError from "../../utils/APIError.js";

export { MikroTikClient, MockMikroTikClient, RouterOsClient };

/**
 * Pick a MikroTik client from a config object.
 *
 * @param {Object} config
 * @param {'mock'|'routeros'} [config.driver='mock'] - which implementation.
 * @param {string} [config.host]
 * @param {number} [config.port]
 * @param {Object} [config.credentials] - { username, password }.
 * @returns {MikroTikClient}
 *
 * @example
 *   const mt = resolveMikroTikClient({ driver: "mock" });
 *   const accounts = await mt.listPppoeSecrets();
 */
export const resolveMikroTikClient = (config = {}) => {
  const driver = config.driver ?? "mock";
  switch (driver) {
    case "mock":
      return new MockMikroTikClient();

    case "routeros":
      return new RouterOsClient({
        host: config.host,
        port: config.port,
        username: config.credentials?.username,
        password: config.credentials?.password,
      });

    default:
      throw new APIError(`Unknown MikroTik client driver '${driver}'`, 400);
  }
};

export default { resolveMikroTikClient, MikroTikClient, MockMikroTikClient, RouterOsClient };
