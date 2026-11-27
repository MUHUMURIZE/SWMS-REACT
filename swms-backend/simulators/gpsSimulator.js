require("dotenv").config();

const readline = require("node:readline");
const { randomUUID } = require("node:crypto");
const {
  assertDevelopmentRuntime,
  assertLoopbackApiUrl,
  assertSimulatedDeviceRecord,
} = require("./guard");
const { readStateFile } = require("./setupTestEnvironment");

function computeBearingDegrees(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Number(bearing.toFixed(2));
}

class GpsSimulator {
  constructor({ apiBaseUrl, devices, intervalMs = 3000, fetchImpl = fetch } = {}) {
    assertDevelopmentRuntime("GPS simulator");
    this.apiBaseUrl = assertLoopbackApiUrl(apiBaseUrl || process.env.SIM_API_BASE_URL || "http://127.0.0.1:3000");
    this.fetchImpl = fetchImpl;
    this.intervalMs = 3000;
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
        routeIndex: 0,
        stepFraction: 0,
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

  setDeviceInterrupted(deviceCode, interrupted) {
    if (typeof interrupted !== "boolean") {
      throw new Error("interrupted must be a boolean.");
    }
    if (deviceCode === "all") {
      for (const item of this.devices.values()) item.interrupted = interrupted;
      return;
    }
    const target = this.devices.get(deviceCode);
    if (!target) throw new Error(`Unknown GPS device ${deviceCode}`);
    target.interrupted = interrupted;
  }

  nextCoordinates(state) {
    const route = state.route && state.route.length >= 2
      ? state.route
      : [
        { latitude: -1.9441, longitude: 30.0619 },
        { latitude: -1.9461, longitude: 30.0649 },
      ];
    const current = route[state.routeIndex % route.length];
    const next = route[(state.routeIndex + 1) % route.length];
    const t = state.stepFraction;
    const latitude = Number((current.latitude + (next.latitude - current.latitude) * t).toFixed(6));
    const longitude = Number((current.longitude + (next.longitude - current.longitude) * t).toFixed(6));
    const heading = computeBearingDegrees(current, next);
    const speed = Number((22 + ((state.routeIndex * 3 + Math.round(t * 10)) % 14)).toFixed(2));

    state.stepFraction += 0.5;
    if (state.stepFraction >= 1) {
      state.stepFraction = 0;
      state.routeIndex = (state.routeIndex + 1) % route.length;
    }

    return { latitude, longitude, heading, speed, accuracy: 4.5 };
  }

  async sendUpdateForDevice(deviceCode) {
    assertDevelopmentRuntime("GPS simulator transmission");
    const state = this.devices.get(deviceCode);
    if (!state) throw new Error(`Unknown GPS device ${deviceCode}`);
    if (state.interrupted) {
      return { deviceCode, skipped: true, reason: "COMMUNICATION_INTERRUPTED" };
    }

    const coords = this.nextCoordinates(state);
    const payload = {
      messageId: `sim-gps-${deviceCode}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: coords.speed,
      heading: coords.heading,
      accuracy: coords.accuracy,
      recordedAt: new Date().toISOString(),
    };
    state.lastPayload = payload;
    state.lastSentAt = new Date().toISOString();

    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}/api/tracking/ingest`, {
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
        results.push(await this.sendUpdateForDevice(deviceCode));
      }
      return results;
    } finally {
      this.stepInProgress = false;
    }
  }

  start() {
    assertDevelopmentRuntime("GPS simulator");
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
      devices: Array.from(this.devices.values()).map((d) => ({
        deviceCode: d.deviceCode,
        vehicleId: d.vehicleId,
        registrationNumber: d.registrationNumber,
        isSimulated: d.isSimulated,
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
  assertDevelopmentRuntime("GPS simulator CLI");
  const state = readStateFile();
  if (!state || !Array.isArray(state.gpsDevices) || state.gpsDevices.length === 0) {
    console.error("Simulation state not found. Run `npm run sim:setup` first.");
    process.exit(1);
  }
  const intervalArg = process.argv.find((arg) => arg.startsWith("--interval="));
  const intervalMs = intervalArg ? Number(intervalArg.split("=")[1]) : 3000;
  const sim = new GpsSimulator({
    apiBaseUrl: process.env.SIM_API_BASE_URL || "http://127.0.0.1:3000",
    devices: state.gpsDevices,
    intervalMs,
  });

  console.log("GPS Simulator ready (development-only, synthetic test vehicles).");
  console.log("Commands: start | pause | resume | stop | step | interval <ms> | offline <code|all> | online <code|all> | status | quit");
  if (process.argv.includes("--autostart")) {
    sim.start();
    console.log("Auto-started GPS simulation.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "gps-sim> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const [cmd, arg] = line.trim().split(/\s+/);
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
      } else if (cmd === "interval" && arg) {
        sim.setIntervalMs(Number(arg));
        console.log(`Interval updated to ${sim.intervalMs} ms.`);
      } else if (cmd === "offline" && arg) {
        sim.setDeviceInterrupted(arg, true);
        console.log(`Simulated communication interruption enabled for ${arg}.`);
      } else if (cmd === "online" && arg) {
        sim.setDeviceInterrupted(arg, false);
        console.log(`Simulated communication restored for ${arg}.`);
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

module.exports = { GpsSimulator, computeBearingDegrees };
