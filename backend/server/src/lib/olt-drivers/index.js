/**
 * OLT drivers — public entry point + driver resolver.
 * ====================================================
 *
 * Everything outside this folder imports drivers from HERE, and (most
 * importantly) uses `resolveDriver(olt)` to get the RIGHT driver for a given OLT
 * row instead of hand-picking a class. That keeps the "which vendor?" decision
 * in one place: add a new vendor driver, wire it into the switch below, done.
 */

import { OltDriver } from "./driver.interface.js";
import { MockOltDriver } from "./mock.driver.js";
import { HsgqOltDriver } from "./hsgq/driver.js";
import APIError from "../../utils/APIError.js";

export { OltDriver, MockOltDriver, HsgqOltDriver };

/**
 * Given an OLT database row, return the driver instance that knows how to talk
 * to it. The row's `vendor` column decides which one.
 *
 * Today only the mock is wired up (Phase 2 builds/tests against it). The real
 * HsgqOltDriver slots into the 'hsgq' case in a later step; until then, asking
 * for it throws a clear, honest error rather than pretending.
 *
 * @param {Object} olt - an `olts` row (needs at least `vendor`).
 * @returns {OltDriver}
 * @throws {APIError} if no driver is available for the OLT's vendor.
 *
 * @example
 *   const driver = resolveDriver(oltRow);
 *   const result = await driver.deactivateOnu(ctx);
 */
export const resolveDriver = (olt) => {
  switch (olt.vendor) {
    case "mock":
      return new MockOltDriver();

    case "hsgq":
      return new HsgqOltDriver();

    default:
      throw new APIError(
        `No OLT driver available for vendor '${olt.vendor}' yet`,
        501,
        "NOT_IMPLEMENTED"
      );
  }
};

export default { resolveDriver, OltDriver, MockOltDriver, HsgqOltDriver };
