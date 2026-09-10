import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.FLASH_ERP_TRIAL_PROVISIONER_PORT || "3099", 10);
const secret = process.env.FLASH_ERP_TRIAL_PROVISIONER_SECRET?.trim();
const worker = path.join(repositoryRoot, "scripts", "trial-workspace-provisioner-worker.ts");

if (!secret) throw new Error("FLASH_ERP_TRIAL_PROVISIONER_SECRET is required.");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("FLASH_ERP_TRIAL_PROVISIONER_PORT must be between 1024 and 65535.");
}

function secureEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyRequest(rawBody, headers) {
  const timestamp = String(headers["x-flash-timestamp"] || "").trim();
  const signature = String(headers["x-flash-signature"] || "").trim();
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60_000) {
    throw new Error("The signed request timestamp is invalid.");
  }
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!signature || !secureEquals(signature, expected)) {
    throw new Error("The signed request is invalid.");
  }
}

function runWorker(command, body = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", worker, command], {
      cwd: repositoryRoot,
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Trial worker ${command} failed with exit code ${code}: ${output.slice(-2000)}`));
    });
    child.stdin.end(body);
  });
}

let queue = Promise.resolve();
function enqueue(command, body = "") {
  queue = queue
    .then(() => runWorker(command, body))
    .catch((error) => {
      process.stderr.write(`[trial-provisioner] ${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}\n`);
    });
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "flash-erp-trial-provisioner" }));
    return;
  }
  if (request.method !== "POST" || !["/provision", "/extend"].includes(request.url || "")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Not found." }));
    return;
  }

  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 64 * 1024) request.destroy(new Error("Request body is too large."));
    else chunks.push(chunk);
  });
  request.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString("utf8");
      verifyRequest(body, request.headers);
      const parsed = JSON.parse(body);
      const command = request.url === "/extend" ? "extend" : "provision";
      const operationId = `${command}:${parsed.requestId || crypto.randomUUID()}:${Date.now()}`;
      enqueue(command, body);
      response.writeHead(202, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ operationId, status: "QUEUED" }));
    } catch (error) {
      response.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Request rejected." }));
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(`[trial-provisioner] Listening on http://${host}:${port}.\n`);
});

const sweepTimer = setInterval(() => enqueue("sweep"), 60_000);
sweepTimer.unref();
const recoveryTimer = setInterval(() => enqueue("recover"), 5 * 60_000);
recoveryTimer.unref();
setTimeout(() => enqueue("recover"), 2_000).unref();
setTimeout(() => enqueue("recover-failed"), 4_000).unref();
setTimeout(() => enqueue("reconcile-active"), 6_000).unref();
setTimeout(() => enqueue("sweep"), 10_000).unref();

function shutdown() {
  clearInterval(sweepTimer);
  clearInterval(recoveryTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
