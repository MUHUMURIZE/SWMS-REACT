const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const auditModel = require("../models/auditModel");
const AppError = require("../utils/AppError");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeAdmin } = require("../middleware/authorization");
const { assertDevelopmentRuntime } = require("./guard");
const { ensureSimulationEnvironment, readStateFile } = require("./setupTestEnvironment");
const { GpsSimulator } = require("./gpsSimulator");
const { IotSimulator } = require("./iotSimulator");

function createDevSimulatorRouter({ getApiBaseUrl }) {
  assertDevelopmentRuntime("Dev simulator router");
  const router = express.Router();
  router.use(authenticateToken, authorizeAdmin);

  let gpsSim = null;
  let iotSim = null;

  function ensureRunnersFromState() {
    const state = readStateFile();
    if (!state) return null;
    const apiBaseUrl = getApiBaseUrl();
    if (!gpsSim && Array.isArray(state.gpsDevices)) {
      gpsSim = new GpsSimulator({ apiBaseUrl, devices: state.gpsDevices });
    }
    if (!iotSim && Array.isArray(state.iotDevices)) {
      iotSim = new IotSimulator({ apiBaseUrl, devices: state.iotDevices });
    }
    return state;
  }

  async function recordSimAudit(req, action, metadata = {}) {
    await auditModel.record({
      actorUserId: req.user.id,
      action,
      resourceType: "SIMULATION",
      ipAddress: req.ip,
      metadata: { isSimulated: true, ...metadata },
    });
  }

  router.get("/status", asyncHandler(async (_req, res) => {
    assertDevelopmentRuntime("Dev simulator status");
    const state = ensureRunnersFromState();
    res.json({
      data: {
        initialized: Boolean(state),
        companyName: state?.companyName || null,
        districtName: state?.districtName || null,
        gps: gpsSim ? gpsSim.snapshot() : null,
        iot: iotSim ? iotSim.snapshot() : null,
      },
    });
  }));

  router.post("/setup", asyncHandler(async (req, res) => {
    assertDevelopmentRuntime("Dev simulator setup");
    if (gpsSim) gpsSim.stop();
    if (iotSim) iotSim.stop();
    const state = await ensureSimulationEnvironment({
      rotateCredentials: Boolean(req.body?.rotateCredentials),
    });
    const apiBaseUrl = getApiBaseUrl();
    gpsSim = new GpsSimulator({ apiBaseUrl, devices: state.gpsDevices });
    iotSim = new IotSimulator({ apiBaseUrl, devices: state.iotDevices });
    await recordSimAudit(req, "SIMULATION_SETUP_EXECUTED", {
      gpsDevices: state.gpsDevices.map((d) => d.deviceCode),
      iotDevices: state.iotDevices.map((d) => d.deviceCode),
    });
    res.status(201).json({
      data: {
        initialized: true,
        companyName: state.companyName,
        districtName: state.districtName,
        gps: gpsSim.snapshot(),
        iot: iotSim.snapshot(),
      },
    });
  }));

  router.post("/gps/:action", asyncHandler(async (req, res) => {
    assertDevelopmentRuntime("GPS simulator control");
    ensureRunnersFromState();
    if (!gpsSim) throw new AppError(409, "Initialize the simulation environment first.", "CONFLICT");
    const { action } = req.params;
    if (action === "start") {
      if (req.body?.intervalMs !== undefined) gpsSim.setIntervalMs(req.body.intervalMs);
      gpsSim.start();
    } else if (action === "pause") {
      gpsSim.pause();
    } else if (action === "resume") {
      gpsSim.resume();
    } else if (action === "stop") {
      gpsSim.stop();
    } else if (action === "step") {
      const prev = gpsSim.status;
      gpsSim.status = "RUNNING";
      await gpsSim.step();
      gpsSim.status = prev;
    } else if (action === "configure") {
      if (req.body?.intervalMs !== undefined) gpsSim.setIntervalMs(req.body.intervalMs);
      if (req.body?.deviceCode && req.body?.interrupted !== undefined) {
        gpsSim.setDeviceInterrupted(req.body.deviceCode, req.body.interrupted);
      }
    } else {
      throw new AppError(400, "Unsupported GPS simulator action.", "VALIDATION_ERROR");
    }
    await recordSimAudit(req, `SIMULATION_GPS_${action.toUpperCase()}`, req.body || {});
    res.json({ data: gpsSim.snapshot() });
  }));

  router.post("/iot/:action", asyncHandler(async (req, res) => {
    assertDevelopmentRuntime("IoT simulator control");
    ensureRunnersFromState();
    if (!iotSim) throw new AppError(409, "Initialize the simulation environment first.", "CONFLICT");
    const { action } = req.params;
    if (action === "start") {
      if (req.body?.intervalMs !== undefined) iotSim.setIntervalMs(req.body.intervalMs);
      iotSim.start();
    } else if (action === "pause") {
      iotSim.pause();
    } else if (action === "resume") {
      iotSim.resume();
    } else if (action === "stop") {
      iotSim.stop();
    } else if (action === "step") {
      const prev = iotSim.status;
      iotSim.status = "RUNNING";
      await iotSim.step();
      iotSim.status = prev;
    } else if (action === "configure") {
      if (req.body?.intervalMs !== undefined) iotSim.setIntervalMs(req.body.intervalMs);
      if (req.body?.deviceCode) {
        iotSim.configureDevice(req.body.deviceCode, req.body);
      }
    } else {
      throw new AppError(400, "Unsupported IoT simulator action.", "VALIDATION_ERROR");
    }
    await recordSimAudit(req, `SIMULATION_IOT_${action.toUpperCase()}`, req.body || {});
    res.json({ data: iotSim.snapshot() });
  }));

  function shutdown() {
    if (gpsSim) gpsSim.stop();
    if (iotSim) iotSim.stop();
  }

  return { router, shutdown };
}

module.exports = { createDevSimulatorRouter };
