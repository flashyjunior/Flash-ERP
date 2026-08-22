import { mkdirSync, createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logDirectory = path.join(repositoryRoot, "logs");
const logPath = path.join(logDirectory, "enterprise-web.log");
const serverScript = path.join(repositoryRoot, "scripts", "start-enterprise-web.mjs");
const restartDelayMs = 5_000;

mkdirSync(logDirectory, { recursive: true });
const log = createWriteStream(logPath, { flags: "a" });

function writeLog(message) {
  log.write(`[enterprise-service] ${new Date().toISOString()} ${message}\n`);
}

let stopping = false;
let activeChild = null;

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

function stopService(reason, childSignal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  writeLog(`${reason} received; stopping enterprise service host.`);
  if (!activeChild) {
    log.end(() => process.exit(0));
    return;
  }

  const child = activeChild;
  child.once("exit", () => log.end(() => process.exit(0)));
  child.kill(childSignal);
  setTimeout(() => {
    if (activeChild === child) child.kill("SIGKILL");
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
