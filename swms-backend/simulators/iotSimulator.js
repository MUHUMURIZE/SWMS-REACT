require("dotenv").config();

const readline = require("node:readline");
const { randomUUID } = require("node:crypto");
const {
  assertDevelopmentRuntime,
  assertLoopbackApiUrl,
  assertSimulatedDeviceRecord,
} = require("./guard");
const { readStateFile } = require("./setupTestEnvironment");

const FILL_PRESETS = [10, 30, 50, 75, 90, 100];

class IotSimulator {
  constructor({ apiBaseUrl, devices, intervalMs = 5000, fetchImpl = fetch } = {}) {
    assertDevelopmentRuntime("IoT smart-bin simulator");
    this.apiBaseUrl = assertLoopbackApiUrl(apiBaseUrl || process.env.SIM_API_BASE_URL || "http://127.0.0.1:3000");
    this.fetchImpl = fetchImpl;
    this.intervalMs = 5000;
    this.setIntervalMs(intervalMs);
    this.status = "IDLE";
    this.timer = null;
    this.stepInProgress = false;
    this.tickCount = 0;
    this.devices = new Map();

    for (const device of devices || []) {
      assertSimulatedDeviceRecord(device);
      this.devices.set(device.deviceCode, {
        ...device,
        fillLevel: Number.isInteger(device.initialFillLevel) ? device.initialFillLevel : 10,
        batteryLevel: 92,
        sensorStatus: "OK",
        overflowDetected: null,
        autoCyclePresets: false,
        presetIndex: 0,
        interrupted: false,
        lastPayload: null,
        lastResponse: null,
        lastError: null,
        lastSentAt: null,
      });
    }
  }

  setIntervalMs(nextMs) {
    const parsed = Number(nextMs);
    if (!Number.isFinite(parsed) || parsed < 500 || parsed > 300_000) {
      throw new Error("Interval must be between 500 and 300000 ms.");
    }
    this.intervalMs = parsed;
    if (this.status === "RUNNING") {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        void this.step();
      }, this.intervalMs);
    }
  }

  configureDevice(deviceCode, config = {}) {
    const targets = deviceCode === "all"
      ? Array.from(this.devices.values())
      : [this.devices.get(deviceCode)].filter(Boolean);
    if (targets.length === 0) throw new Error(`Unknown IoT device ${deviceCode}`);

    for (const target of targets) {
      if (config.fillLevel !== undefined) {
        const fill = Number(config.fillLevel);
        if (!Number.isInteger(fill) || fill < 0 || fill > 100) {
          throw new Error("fillLevel must be an integer between 0 and 100.");
        }
        target.fillLevel = fill;
      }
      if (config.batteryLevel !== undefined) {
        if (config.batteryLevel === null) {
          target.batteryLevel = null;
        } else {
          const battery = Number(config.batteryLevel);
          if (!Number.isInteger(battery) || battery < 0 || battery > 100) {
            throw new Error("batteryLevel must be an integer between 0 and 100 or null.");
          }
          target.batteryLevel = battery;
        }
      }
      if (config.sensorStatus !== undefined) {
        if (!["OK", "DEGRADED", "FAULT"].includes(config.sensorStatus)) {
          throw new Error("sensorStatus must be OK, DEGRADED, or FAULT.");
        }
        target.sensorStatus = config.sensorStatus;
      }
      if (config.overflowDetected !== undefined) {
        if (config.overflowDetected !== null && typeof config.overflowDetected !== "boolean") {
          throw new Error("overflowDetected must be a boolean or null.");
        }
        target.overflowDetected = config.overflowDetected;
      }
      if (config.interrupted !== undefined) {
        if (typeof config.interrupted !== "boolean") {
          throw new Error("interrupted must be a boolean.");
        }
        target.interrupted = config.interrupted;
      }
      if (config.autoCyclePresets !== undefined) {
        if (typeof config.autoCyclePresets !== "boolean") {
          throw new Error("autoCyclePresets must be a boolean.");
        }
        target.autoCyclePresets = config.autoCyclePresets;
      }
    }
  }

  async sendReadingForDevice(deviceCode) {
    assertDevelopmentRuntime("IoT simulator transmission");
    const state = this.devices.get(deviceCode);
    if (!state) throw new Error(`Unknown IoT device ${deviceCode}`);
    if (state.interrupted) {
      return { deviceCode, skipped: true, reason: "COMMUNICATION_INTERRUPTED" };
    }

    if (state.autoCyclePresets) {
      state.fillLevel = FILL_PRESETS[state.presetIndex % FILL_PRESETS.length];
      state.presetIndex += 1;
    }

    const payload = {
      messageId: `sim-iot-${deviceCode}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      fillLevel: state.fillLevel,
      sensorStatus: state.sensorStatus,
      measuredAt: new Date().toISOString(),
      ...(state.batteryLevel !== null ? { batteryLevel: state.batteryLevel } : {}),
      ...(state.overflowDetected !== null ? { overflowDetected: state.overflowDetected } : {}),
    };
    state.lastPayload = payload;
    state.lastSentAt = new Date().toISOString();

    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}/api/iot/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Credential": state.credential,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      state.lastResponse = { status: response.status, body };
      state.lastError = response.ok ? null : (body?.error?.message || `HTTP ${response.status}`);
      return { deviceCode, payload, response: state.lastResponse };
    } catch (error) {
      state.lastError = error.message;
      state.lastResponse = null;
      return { deviceCode, payload, error: error.message };
    }
  }

  async step() {
    if (this.status !== "RUNNING" || this.stepInProgress) return [];
    this.stepInProgress = true;
    this.tickCount += 1;
    const results = [];
    try {
      for (const deviceCode of this.devices.keys()) {
        results.push(await this.sendReadingForDevice(deviceCode));
      }
      return results;
    } finally {
      this.stepInProgress = false;
    }
  }

  start() {
    assertDevelopmentRuntime("IoT simulator");
    if (this.status === "RUNNING") return this.snapshot();
    this.status = "RUNNING";
    void this.step();
    this.timer = setInterval(() => {
      void this.step();
    }, this.intervalMs);
    return this.snapshot();
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.status === "RUNNING") this.status = "PAUSED";
    return this.snapshot();
  }

  resume() {
    if (this.status === "PAUSED") return this.start();
    return this.snapshot();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = "STOPPED";
    return this.snapshot();
  }

  snapshot() {
    return {
      status: this.status,
      apiBaseUrl: this.apiBaseUrl,
      intervalMs: this.intervalMs,
      tickCount: this.tickCount,
      presets: FILL_PRESETS,
      devices: Array.from(this.devices.values()).map((d) => ({
        deviceCode: d.deviceCode,
        binId: d.binId,
        binCode: d.binCode,
        isSimulated: d.isSimulated,
        fillLevel: d.fillLevel,
        batteryLevel: d.batteryLevel,
        sensorStatus: d.sensorStatus,
        overflowDetected: d.overflowDetected,
        autoCyclePresets: d.autoCyclePresets,
        interrupted: d.interrupted,
        lastSentAt: d.lastSentAt,
        lastPayload: d.lastPayload,
        lastResponse: d.lastResponse,
        lastError: d.lastError,
      })),
    };
  }
}

function runCli() {
  assertDevelopmentRuntime("IoT simulator CLI");
  const state = readStateFile();
  if (!state || !Array.isArray(state.iotDevices) || state.iotDevices.length === 0) {
    console.error("Simulation state not found. Run `npm run sim:setup` first.");
    process.exit(1);
  }
  const intervalArg = process.argv.find((arg) => arg.startsWith("--interval="));
  const intervalMs = intervalArg ? Number(intervalArg.split("=")[1]) : 5000;
  const sim = new IotSimulator({
    apiBaseUrl: process.env.SIM_API_BASE_URL || "http://127.0.0.1:3000",
    devices: state.iotDevices,
    intervalMs,
  });

  console.log("IoT Smart-Bin Simulator ready (development-only, synthetic test bins).");
  console.log("Commands: start | pause | resume | stop | step | fill <code|all> <0-100> | battery <code|all> <0-100|none> | health <code|all> <OK|DEGRADED|FAULT> | overflow <code|all> <true|false|none> | cycle <code|all> <on|off> | offline <code|all> | online <code|all> | status | quit");
  if (process.argv.includes("--autostart")) {
    sim.start();
    console.log("Auto-started IoT simulation.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "iot-sim> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const [cmd, arg1, arg2] = line.trim().split(/\s+/);
    try {
      if (cmd === "start") console.log(JSON.stringify(sim.start(), null, 2));
      else if (cmd === "pause") console.log(JSON.stringify(sim.pause(), null, 2));
      else if (cmd === "resume") console.log(JSON.stringify(sim.resume(), null, 2));
      else if (cmd === "stop") console.log(JSON.stringify(sim.stop(), null, 2));
      else if (cmd === "step") {
        const previous = sim.status;
        sim.status = "RUNNING";
        const res = await sim.step();
        sim.status = previous;
        console.log(JSON.stringify(res, null, 2));
      } else if (cmd === "fill" && arg1 && arg2 !== undefined) {
        sim.configureDevice(arg1, { fillLevel: Number(arg2), autoCyclePresets: false });
        console.log(`Updated fill level for ${arg1} to ${arg2}%.`);
      } else if (cmd === "battery" && arg1 && arg2 !== undefined) {
        sim.configureDevice(arg1, { batteryLevel: arg2 === "none" ? null : Number(arg2) });
        console.log(`Updated battery level for ${arg1} to ${arg2}.`);
      } else if (cmd === "health" && arg1 && arg2) {
        sim.configureDevice(arg1, { sensorStatus: arg2.toUpperCase() });
        console.log(`Updated sensor health for ${arg1} to ${arg2.toUpperCase()}.`);
      } else if (cmd === "overflow" && arg1 && arg2) {
        const overflow = arg2 === "none" ? null : arg2 === "true";
        sim.configureDevice(arg1, { overflowDetected: overflow });
        console.log(`Updated overflow for ${arg1} to ${overflow}.`);
      } else if (cmd === "cycle" && arg1 && arg2) {
        sim.configureDevice(arg1, { autoCyclePresets: arg2 === "on" });
        console.log(`Preset cycling for ${arg1}: ${arg2}.`);
      } else if (cmd === "offline" && arg1) {
        sim.configureDevice(arg1, { interrupted: true });
        console.log(`Simulated communication interruption enabled for ${arg1}.`);
      } else if (cmd === "online" && arg1) {
        sim.configureDevice(arg1, { interrupted: false });
        console.log(`Simulated communication restored for ${arg1}.`);
      } else if (cmd === "status") {
        console.log(JSON.stringify(sim.snapshot(), null, 2));
      } else if (cmd === "quit" || cmd === "exit") {
        sim.stop();
        rl.close();
        return;
      } else if (cmd) {
        console.log("Unknown command.");
      }
    } catch (error) {
      console.error("Command error:", error.message);
    }
    rl.prompt();
  });
}

if (require.main === module) {
  runCli();
}

module.exports = { IotSimulator, FILL_PRESETS };
