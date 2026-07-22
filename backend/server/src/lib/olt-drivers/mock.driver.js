/**
 * MockOltDriver — a fake OLT that lives entirely in memory.
 * =========================================================
 *
 * It implements the exact same four-method contract as a real driver
 * (see driver.interface.js), but instead of telnetting into hardware it just
 * flips values on an in-memory "whiteboard" (a Map) and returns realistic-
 * looking fake device transcripts.
 *
 * WHY: the platform can disconnect real customers. We build and test the entire
 * billing -> disconnect -> reconnect flow against this fake first, with ZERO
 * hardware, and only later swap in the real HsgqOltDriver. The fake transcripts
 * deliberately mirror the real HSGQ XE04I commands (blacklist / onu-deregister /
 * onu-authorize / show onu-info) so the transition is smooth.
 *
 * TWO knobs make it useful for testing failure handling later:
 *   - latencyMs   : how long each "device call" pretends to take.
 *   - failureRate : 0..1 chance a call fails, to exercise retry/dead-letter.
 * Both can come from the constructor (tests) or env (dev), with safe defaults.
 */

import { OltDriver } from "./driver.interface.js";

/**
 * One ONU as the mock "device" remembers it. This is the whiteboard row.
 *
 * @typedef {Object} MockOnu
 * @property {string} mac        - EPON primary identifier, e.g. "30:c5:0f:d8:7f:2c".
 * @property {string} onuIndex   - pon/onu-id, e.g. "1/27".
 * @property {string} serialNo   - inventory label on the unit.
 * @property {string} model
 * @property {string} description - free-text the prior ISP left on the ONU.
 * @property {boolean} online     - is it currently passing traffic?
 * @property {boolean} blacklisted- suspended at the OLT (what holds it down).
 * @property {number} rxDbm       - optical receive power.
 * @property {number} txDbm       - optical transmit power.
 */

/**
 * Seed the whiteboard with a couple of realistic ONUs. One of them mirrors the
 * actual lab unit from HSGQ_DOCUMENTATION.md so dev data feels real.
 * @returns {Map<string, MockOnu>} keyed by MAC (lowercased).
 */
const seedOnus = () => {
  /** @type {MockOnu[]} */
  const list = [
    {
      mac: "30:c5:0f:d8:7f:2c",
      onuIndex: "1/27",
      serialNo: "45V5",
      model: "Huawei EG8145V5",
      description: "Jacqueline-Rebancos PON 2 NAP 1 PORT 5",
      online: true,
      blacklisted: false,
      rxDbm: -11.97,
      txDbm: 2.17,
    },
    {
      mac: "48:57:02:11:22:33",
      onuIndex: "1/5",
      serialNo: "ONU00005",
      model: "VSOL V2802RH",
      description: "Test-Customer PON 1 NAP 2 PORT 3",
      online: true,
      blacklisted: false,
      rxDbm: -13.4,
      txDbm: 2.6,
    },
  ];

  const map = new Map();
  for (const onu of list) {
    map.set(onu.mac.toLowerCase(), onu);
  }
  return map;
};

export class MockOltDriver extends OltDriver {
  /**
   * @param {Object} [options]
   * @param {number} [options.latencyMs]   - simulated per-call delay.
   * @param {number} [options.failureRate] - 0..1 chance each call fails.
   * @param {Map<string, MockOnu>} [options.onus] - inject custom state (tests).
   */
  constructor(options = {}) {
    super();
    this.vendor = "mock";

    // Precedence: explicit option -> env var -> sensible default.
    this.latencyMs =
      options.latencyMs ?? Number(process.env.MOCK_OLT_LATENCY_MS ?? 50);
    this.failureRate =
      options.failureRate ?? Number(process.env.MOCK_OLT_FAILURE_RATE ?? 0);

    // The in-memory device state.
    this.onus = options.onus ?? seedOnus();
  }

  /* --------------------------- small helpers --------------------------- */

  /** Pretend a device call takes some time (network + CLI round-trip). */
  async _delay() {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  /**
   * Randomly decide this call "failed" (device unreachable / timeout), so we can
   * test retry + dead-letter behaviour later. Returns a failure DriverResult or
   * null if the call should proceed.
   * @param {string} command
   * @returns {import('./driver.interface.js').DriverResult | null}
   */
  _maybeFail(command) {
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      return {
        success: false,
        command,
        rawResponse: "% Connection timed out; no response from device",
        error: "Simulated device timeout",
      };
    }
    return null;
  }

  /**
   * Find an ONU on the whiteboard by MAC (preferred) or onuIndex.
   * @param {import('./driver.interface.js').OltContext} ctx
   * @returns {MockOnu | undefined}
   */
  _find(ctx) {
    if (ctx.mac && this.onus.has(ctx.mac.toLowerCase())) {
      return this.onus.get(ctx.mac.toLowerCase());
    }
    if (ctx.onuIndex) {
      for (const onu of this.onus.values()) {
        if (onu.onuIndex === ctx.onuIndex) {
          return onu;
        }
      }
    }
    return undefined;
  }

  /* ----------------------------- contract ------------------------------ */

  /**
   * Deactivate (suspend) an ONU: blacklist its MAC, then deregister it.
   * Mirrors the real HSGQ sequence — blacklist is what HOLDS it down (a bare
   * deregister re-registers within seconds).
   * @param {import('./driver.interface.js').OltContext} ctx
   */
  async deactivateOnu(ctx) {
    await this._delay();
    const [pon] = (ctx.onuIndex ?? "1/0").split("/");
    const onuId = (ctx.onuIndex ?? "1/0").split("/")[1];
    const command = [
      "configure",
      `interface epon ${pon}`,
      `blacklist add mac ${ctx.mac ?? "unknown"}`,
      `onu-deregister ${onuId}`,
      "save",
    ].join("\n");

    const failed = this._maybeFail(command);
    if (failed) return failed;

    const onu = this._find(ctx);
    if (!onu) {
      return {
        success: false,
        command,
        rawResponse: `% ONU ${ctx.mac ?? ctx.onuIndex} not found`,
        error: "ONU not found on device",
      };
    }

    onu.blacklisted = true;
    onu.online = false;

    return {
      success: true,
      command,
      rawResponse: [
        `MAC ${onu.mac} added to blacklist`,
        `ONU ${onu.onuIndex} deregistered`,
        "Configuration saved",
      ].join("\n"),
      parsed: { blacklisted: true, online: false },
    };
  }

  /**
   * Activate (reconnect) an ONU: remove it from the blacklist and re-authorize.
   * @param {import('./driver.interface.js').OltContext} ctx
   */
  async activateOnu(ctx) {
    await this._delay();
    const [pon] = (ctx.onuIndex ?? "1/0").split("/");
    const onuId = (ctx.onuIndex ?? "1/0").split("/")[1];
    const command = [
      "configure",
      `interface epon ${pon}`,
      `blacklist del mac ${ctx.mac ?? "unknown"}`,
      `onu-authorize ${onuId}`,
      "save",
    ].join("\n");

    const failed = this._maybeFail(command);
    if (failed) return failed;

    const onu = this._find(ctx);
    if (!onu) {
      return {
        success: false,
        command,
        rawResponse: `% ONU ${ctx.mac ?? ctx.onuIndex} not found`,
        error: "ONU not found on device",
      };
    }

    onu.blacklisted = false;
    onu.online = true;

    return {
      success: true,
      command,
      rawResponse: [
        `MAC ${onu.mac} removed from blacklist`,
        `ONU ${onu.onuIndex} authorization success`,
        `ONU ${onu.onuIndex} link up`,
        "Configuration saved",
      ].join("\n"),
      parsed: { blacklisted: false, online: true },
    };
  }

  /**
   * Read one ONU's live state (online?, optical Rx/Tx).
   * @param {import('./driver.interface.js').OltContext} ctx
   */
  async getOnuStatus(ctx) {
    await this._delay();
    const command = `show onu-info ${ctx.onuIndex ?? ctx.mac ?? ""}`.trim();

    const failed = this._maybeFail(command);
    if (failed) return failed;

    const onu = this._find(ctx);
    if (!onu) {
      return {
        success: false,
        command,
        rawResponse: `% ONU ${ctx.mac ?? ctx.onuIndex} not found`,
        error: "ONU not found on device",
      };
    }

    return {
      success: true,
      command,
      rawResponse: [
        `ONU ${onu.onuIndex}  MAC ${onu.mac}`,
        `  auth: TRUE  config: TRUE  online: ${onu.online ? "Online" : "Offline"}`,
        `  RX: ${onu.rxDbm} dBm  TX: ${onu.txDbm} dBm`,
      ].join("\n"),
      parsed: {
        online: onu.online,
        blacklisted: onu.blacklisted,
        rxDbm: onu.rxDbm,
        txDbm: onu.txDbm,
      },
    };
  }

  /**
   * List every ONU the mock OLT can see (optionally scoped to one PON port).
   * Used later by Device Discovery. `parsed` is the array of records.
   * @param {import('./driver.interface.js').OltContext} ctx
   */
  async listOnus(ctx) {
    await this._delay();
    const command = ctx.ponPortIndex
      ? `interface epon ${ctx.ponPortIndex}\nshow onu-info all`
      : "show onu-info all";

    const failed = this._maybeFail(command);
    if (failed) return failed;

    let records = [...this.onus.values()];
    if (ctx.ponPortIndex) {
      records = records.filter((o) => o.onuIndex.startsWith(`${ctx.ponPortIndex}/`));
    }

    const rows = records.map((o) => ({
      onuIndex: o.onuIndex,
      mac: o.mac,
      serialNo: o.serialNo,
      model: o.model,
      description: o.description,
      online: o.online,
      blacklisted: o.blacklisted,
      rxDbm: o.rxDbm,
    }));

    return {
      success: true,
      command,
      rawResponse: rows
        .map((r) => `${r.onuIndex}  ${r.mac}  ${r.online ? "Online" : "Offline"}  "${r.description}"`)
        .join("\n"),
      parsed: rows,
    };
  }
}

export default MockOltDriver;
