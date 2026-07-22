/**
 * HSGQ XE04I — Telnet transport (the ONLY part that does real network I/O).
 * =========================================================================
 *
 * A tiny telnet client over Node's built-in `net` socket (no extra dependency).
 * Its whole job: connect, log in, walk the CLI prompt state machine, run a
 * command plan (from commands.js), and hand back the raw text the device
 * printed. The driver then feeds that raw text to the parsers (parsers.js).
 *
 * CLI navigation (from HSGQ_DOCUMENTATION.md §12):
 *   login  ->  Tera-Network>            (user/exec mode)
 *   enable ->  Tera-Network#            (privileged mode)
 *   configure -> Tera-Network(config)#  (global config)
 *   interface epon 1 -> Tera-Network(config-epon-1)#
 * Quirk: most `show` commands only work inside config/interface mode.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ⚠  LOGIN BANNER + ENABLE BEHAVIOUR ARE BENCH-VERIFY ITEMS.               │
 * │ The doc confirms telnet on 192.168.88.10:23 and the prompt names, but not │
 * │ the exact "Username:"/"Password:" banner or whether `enable` prompts for  │
 * │ a password. The prompt regexes below are written defensively; confirm on  │
 * │ the real XE04I and tweak. Until then this is exercised only against a fake │
 * │ telnet server in tests + kept behind DRY_RUN.                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SAFETY: every path (success, timeout, socket error) ends by destroying the
 * socket in close(), so we never leak a session on the OLT (which allows only
 * ONE concurrent session — max_concurrent_sessions = 1 on the XE04I).
 */

import net from "node:net";

// A CLI prompt: ends with '>' (user) or '#' (enable/config), optional trailing space.
const PROMPT_RE = /[>#]\s*$/;
const LOGIN_RE = /(?:login|username)\s*:/i;
const PASSWORD_RE = /password\s*:/i;

export class HsgqTelnetTransport {
  /**
   * @param {Object} opts
   * @param {string} opts.host
   * @param {number} [opts.port=23]
   * @param {string} opts.username
   * @param {string} opts.password
   * @param {string} [opts.enablePassword] - sent if `enable` prompts for one.
   * @param {number} [opts.timeoutMs=10000] - per-step read timeout.
   */
  constructor({ host, port = 23, username, password, enablePassword, timeoutMs = 10000 }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.enablePassword = enablePassword;
    this.timeoutMs = timeoutMs;

    this.socket = null;
    this.buffer = ""; // accumulates bytes until a prompt/pattern is seen
    this._waiter = null; // the single in-flight { patterns, resolve, reject, timer }
  }

  /**
   * Open the TCP connection. Resolves once connected (not yet logged in).
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port });
      this.socket.setEncoding("utf8");

      const onConnectError = (err) => reject(err);
      this.socket.once("error", onConnectError);

      this.socket.once("connect", () => {
        this.socket.removeListener("error", onConnectError);
        // Feed incoming bytes into the buffer + notify any waiter.
        this.socket.on("data", (chunk) => {
          this.buffer += chunk;
          this._checkWaiter();
        });
        // If the socket dies mid-operation, fail the pending waiter.
        this.socket.on("error", (err) => this._failWaiter(err));
        this.socket.on("close", () => this._failWaiter(new Error("Connection closed by device")));
        resolve();
      });
    });
  }

  /**
   * Wait until the accumulated buffer matches one of `patterns`.
   * @param {Array<{name: string, re: RegExp}>} patterns
   * @returns {Promise<{ name: string, text: string }>} the matched name + text so far.
   */
  _expect(patterns) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._waiter = null;
        reject(new Error(`Timed out waiting for ${patterns.map((p) => p.name).join("/")} (got: ${JSON.stringify(this.buffer.slice(-80))})`));
      }, this.timeoutMs);

      this._waiter = { patterns, resolve, reject, timer };
      this._checkWaiter(); // maybe it's already in the buffer
    });
  }

  /** Test the buffer against the current waiter's patterns; resolve on a hit. */
  _checkWaiter() {
    if (!this._waiter) return;
    for (const { name, re } of this._waiter.patterns) {
      if (re.test(this.buffer)) {
        const text = this.buffer;
        this.buffer = "";
        clearTimeout(this._waiter.timer);
        const { resolve } = this._waiter;
        this._waiter = null;
        resolve({ name, text });
        return;
      }
    }
  }

  /** Fail the pending waiter (socket error/close). */
  _failWaiter(err) {
    if (!this._waiter) return;
    clearTimeout(this._waiter.timer);
    const { reject } = this._waiter;
    this._waiter = null;
    reject(err);
  }

  /** Write a line to the device (CRLF-terminated, as telnet expects). */
  _writeLine(line) {
    this.socket.write(`${line}\r\n`);
  }

  /**
   * Log in: answer the Username/Password banner, land on the user prompt.
   * @returns {Promise<void>}
   */
  async login() {
    await this._expect([{ name: "login", re: LOGIN_RE }]);
    this._writeLine(this.username);
    await this._expect([{ name: "password", re: PASSWORD_RE }]);
    this._writeLine(this.password);
    await this._expect([{ name: "prompt", re: PROMPT_RE }]);
  }

  /**
   * Send one command and return everything printed up to the next prompt —
   * with that trailing prompt stripped off.
   *
   * WHY strip it: prompts have no trailing newline (e.g. "...(config-epon-1)# ").
   * If we kept it, concatenating several commands' output would GLUE the next
   * command's first line onto a prompt fragment, and a line-based parser would
   * mis-read (or skip) it. Stripping the trailing prompt keeps each chunk clean.
   *
   * @param {string} line
   * @returns {Promise<string>} raw device output for this command (prompt removed).
   */
  async exec(line) {
    this._writeLine(line);
    const { text } = await this._expect([{ name: "prompt", re: PROMPT_RE }]);
    // Remove the final prompt line (e.g. "\nTera-Network(config-epon-1)# ").
    return text.replace(/\r?\n?[^\r\n]*[>#][ \t]*$/, "");
  }

  /**
   * Enter privileged mode, handling an optional enable password prompt.
   * @returns {Promise<void>}
   */
  async enable() {
    this._writeLine("enable");
    const { name } = await this._expect([
      { name: "password", re: PASSWORD_RE },
      { name: "prompt", re: PROMPT_RE },
    ]);
    if (name === "password") {
      this._writeLine(this.enablePassword ?? this.password);
      await this._expect([{ name: "prompt", re: PROMPT_RE }]);
    }
  }

  /**
   * Run a command plan from commands.js: enable -> configure -> interface ->
   * commands -> (save) -> collect all raw output.
   *
   * @param {{ interface: string, commands: string[], save: boolean }} plan
   * @returns {Promise<{ command: string, rawResponse: string }>}
   */
  async execPlan(plan) {
    const parts = [];
    await this.enable();
    parts.push(await this.exec("configure"));
    parts.push(await this.exec(`interface ${plan.interface}`));
    for (const cmd of plan.commands) {
      parts.push(await this.exec(cmd));
    }
    parts.push(await this.exec("exit")); // leave the interface
    if (plan.save) {
      parts.push(await this.exec("save"));
    }
    return {
      command: plan.commands.join("\n"),
      rawResponse: parts.join(""),
    };
  }

  /**
   * Close the session. Safe to call multiple times. ALWAYS call this (finally).
   */
  async close() {
    if (this.socket && !this.socket.destroyed) {
      try {
        this._writeLine("exit"); // best-effort logout
      } catch {
        // ignore — we're tearing down anyway
      }
      this.socket.destroy();
    }
    this.socket = null;
  }
}

export default HsgqTelnetTransport;
