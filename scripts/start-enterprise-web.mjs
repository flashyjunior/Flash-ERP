import crypto from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const rawPort = process.env.PORT?.trim();
const port = rawPort && /^\d+$/.test(rawPort) ? Number(rawPort) : 3000;
const hostname = process.env.HOST?.trim() || "0.0.0.0";
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const writeLimit = positiveInteger(process.env.FLASH_ERP_HTTP_WRITE_CONCURRENCY, 32);
const maxQueue = positiveInteger(process.env.FLASH_ERP_HTTP_WRITE_MAX_QUEUE, 512);
const queueTimeoutMs = positiveInteger(process.env.FLASH_ERP_HTTP_WRITE_QUEUE_TIMEOUT_MS, 10_000);
const startupWarmupEnabled = process.env.FLASH_ERP_STARTUP_WARMUP_ENABLED === "true";
const require = createRequire(import.meta.url);
const next = require("next");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = path.join(repositoryRoot, "apps", "enterprise-web");
const app = next({ dev: false, hostname, port, dir: appDirectory });
const handle = app.getRequestHandler();
let activeWrites = 0;
const writeQueue = [];
let clusterReady = !startupWarmupEnabled;

class WriteCapacityError extends Error {}

function removeWaiter(waiter) {
  const index = writeQueue.indexOf(waiter);
  if (index >= 0) writeQueue.splice(index, 1);
}

function acquireWriteSlot(request) {
  if (activeWrites < writeLimit) {
    activeWrites += 1;
    return Promise.resolve();
  }
  if (writeQueue.length >= maxQueue) {
    return Promise.reject(new WriteCapacityError("Enterprise write queue is full."));
  }

  return new Promise((resolve, reject) => {
    const waiter = {
      settled: false,
      resolve: () => {
        if (waiter.settled) return;
        waiter.settled = true;
        clearTimeout(waiter.timeout);
        request.off("aborted", waiter.abort);
        resolve();
      },
      reject: (error) => {
        if (waiter.settled) return;
        waiter.settled = true;
        clearTimeout(waiter.timeout);
        request.off("aborted", waiter.abort);
        removeWaiter(waiter);
        reject(error);
      },
      abort: () => waiter.reject(new WriteCapacityError("Client disconnected while queued.")),
      timeout: null
    };
    waiter.timeout = setTimeout(
      () => waiter.reject(new WriteCapacityError("Enterprise write queue timed out.")),
      queueTimeoutMs
    );
    request.once("aborted", waiter.abort);
    writeQueue.push(waiter);
  });
}

function releaseWriteSlot() {
  while (writeQueue.length > 0) {
    const waiter = writeQueue.shift();
    if (waiter && !waiter.settled) {
      waiter.resolve();
      return;
    }
  }
  activeWrites = Math.max(0, activeWrites - 1);
}

await app.prepare();

const server = http.createServer(async (request, response) => {
  const requestId =
    (Array.isArray(request.headers["x-request-id"])
      ? request.headers["x-request-id"][0]
      : request.headers["x-request-id"]
    )?.trim() || crypto.randomUUID();
  request.headers["x-request-id"] = requestId;
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-flash-erp-worker", process.env.FLASH_ERP_WEB_WORKER_ID ?? "single");
  response.setHeader("x-flash-erp-write-limit", String(writeLimit));

  const requestPath = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  const isWarmupRequest = requestPath === "/api/system/warmup";
  if (!clusterReady && !isWarmupRequest) {
    response.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "2"
    });
    response.end(JSON.stringify({
      ok: false,
      code: "ENTERPRISE_STARTING",
      message: "Flash ERP is warming its Enterprise read models. Try again shortly.",
      requestId
    }));
    return;
  }

  const isWrite = writeMethods.has((request.method ?? "GET").toUpperCase());
  let acquired = false;
  try {
    if (isWrite) {
      await acquireWriteSlot(request);
      acquired = true;
      response.setHeader("x-flash-erp-write-active", String(activeWrites));
      response.setHeader("x-flash-erp-write-queued", String(writeQueue.length));
    }
    await handle(request, response);
  } catch (error) {
    if (error instanceof WriteCapacityError) {
      if (!request.aborted && !response.headersSent) {
        response.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "2"
        });
        response.end(JSON.stringify({
          code: "ENTERPRISE_WRITE_CAPACITY_BUSY",
          message: "Flash ERP is handling unusually high write demand. Try again shortly.",
          requestId
        }));
      }
    } else {
      process.stderr.write(
        `[enterprise-web] Request ${requestId} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
      );
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Internal Server Error");
      } else if (!response.writableEnded) {
        response.end();
      }
    }
  } finally {
    if (acquired) releaseWriteSlot();
  }
});

server.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, hostname, () => {
  process.stdout.write(
    `[enterprise-web] Listening on http://${hostname}:${port}; readiness ${clusterReady ? "ready" : "warming"}; write concurrency ${writeLimit}, queue ${maxQueue}.\n`
  );
});

process.on("message", (message) => {
  if (!message || typeof message !== "object" || message.type !== "enterprise-cluster-readiness") return;
  clusterReady = message.ready === true;
  process.stdout.write(
    `[enterprise-web] Cluster readiness ${clusterReady ? "opened" : "closed"} on worker ${process.env.FLASH_ERP_WEB_WORKER_ID ?? "single"}.\n`
  );
});

function shutdown(signal) {
  process.stdout.write(`[enterprise-web] ${signal} received; stopping new connections.\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
