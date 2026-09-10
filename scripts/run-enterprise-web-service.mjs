import { mkdirSync, createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repositoryRoot, ".env") });
const logDirectory = path.join(repositoryRoot, "logs");
const logPath = process.env.FLASH_ERP_SERVICE_LOG_PATH?.trim() || path.join(logDirectory, "enterprise-web.log");
const serverScript = path.join(repositoryRoot, "scripts", "start-enterprise-web.mjs");
const restartDelayMs = 5_000;

mkdirSync(path.dirname(logPath), { recursive: true });
const log = createWriteStream(logPath, { flags: "a" });

function writeLog(message) {
  log.write(`[enterprise-service] ${new Date().toISOString()} ${message}\n`);
}

let stopping = false;
let activeChild = null;
let activeProvisioner = null;

function startServer() {
  writeLog(`Starting enterprise web process with ${process.execPath}.`);
  const child = spawn(process.execPath, [serverScript], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: process.env.PORT?.trim() || "3000",
      HOST: process.env.HOST?.trim() || "0.0.0.0"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  activeChild = child;
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });

  child.on("error", (error) => {
    writeLog(`Could not start enterprise web process: ${error.stack ?? error.message}`);
  });

  child.on("exit", (code, signal) => {
    activeChild = null;
    writeLog(`Enterprise web process exited with code ${code ?? "none"}, signal ${signal ?? "none"}.`);
    if (stopping) {
      return;
    }

    writeLog(`Restarting enterprise web process in ${restartDelayMs}ms.`);
    setTimeout(startServer, restartDelayMs);
  });
}

function startProvisioner() {
  if (process.env.FLASH_ERP_TRIAL_PROVISIONER_ENABLED !== "true") return;
  const provisionerScript = path.join(repositoryRoot, "scripts", "run-trial-provisioner-service.mjs");
  writeLog(`Starting trial provisioner with ${process.execPath}.`);
  const child = spawn(process.execPath, [provisionerScript], {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  activeProvisioner = child;
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.on("error", (error) => {
    writeLog(`Could not start trial provisioner: ${error.stack ?? error.message}`);
  });
  child.on("exit", (code, signal) => {
    activeProvisioner = null;
    writeLog(`Trial provisioner exited with code ${code ?? "none"}, signal ${signal ?? "none"}.`);
    if (!stopping) {
      writeLog(`Restarting trial provisioner in ${restartDelayMs}ms.`);
      setTimeout(startProvisioner, restartDelayMs);
    }
  });
}

function stopService(reason, childSignal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  writeLog(`${reason} received; stopping enterprise service host.`);
  const children = [activeChild, activeProvisioner].filter(Boolean);
  if (children.length === 0) {
    log.end(() => process.exit(0));
    return;
  }
  let remaining = children.length;
  const complete = () => {
    remaining -= 1;
    if (remaining === 0) log.end(() => process.exit(0));
  };
  for (const child of children) {
    child.once("exit", complete);
    child.kill(childSignal);
  }
  setTimeout(() => {
    if (activeChild) activeChild.kill("SIGKILL");
    if (activeProvisioner) activeProvisioner.kill("SIGKILL");
  }, 30_000).unref();
}

process.on("SIGINT", () => stopService("SIGINT", "SIGINT"));
process.on("SIGTERM", () => stopService("SIGTERM", "SIGTERM"));
process.on("uncaughtException", (error) => {
  writeLog(`Service host uncaught exception: ${error.stack ?? error.message}`);
  stopService("UNCAUGHT_EXCEPTION", "SIGTERM");
});
process.on("unhandledRejection", (reason) => {
  writeLog(`Service host unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});

writeLog(`Service host started with PID ${process.pid}.`);
startServer();
startProvisioner();
