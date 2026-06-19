import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { StoreTerminalContext } from "./offline/local-store-service.js";
import type { StoreServerHealth } from "../shared/desktop-runtime.js";
import {
  isStoreServiceMethod,
  type StoreServiceErrorResponse,
  type StoreServiceMethod,
  type StoreServiceRequest,
  type StoreServiceResponse
} from "./store-service-contract.js";

export type StoreServiceClient = {
  call: (method: StoreServiceMethod, args?: unknown[]) => Promise<unknown>;
};

export type StoreServiceServerHandle = {
  url: string;
  close: () => Promise<void>;
};

export type StoreServiceRuntime = {
  databasePath: string;
  runWithTerminalContext: <T>(
    context: StoreTerminalContext | null | undefined,
    work: () => T | Promise<T>
  ) => T | Promise<T>;
  recordTerminalHeartbeat: (input?: {
    method?: string | null;
    remoteAddress?: string | null;
    userAgent?: string | null;
    clientName?: string | null;
  }) => unknown;
  close?: () => unknown;
};

type StoreServiceRequestMetadata = {
  method?: string | null;
  remoteAddress?: string | null;
  userAgent?: string | null;
  clientName?: string | null;
};

function serializeError(error: unknown): StoreServiceErrorResponse["error"] {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    };
  }

  return {
    message: typeof error === "string" ? error : "Flash ERP store service failed.",
    name: "StoreServiceError"
  };
}

function readSingleHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readBearerToken(value: string | string[] | undefined) {
  const headerValue = readSingleHeader(value)?.trim() ?? "";
  const match = headerValue.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function isAuthorizedRequest(request: IncomingMessage, serverToken: string | null | undefined) {
  const expectedToken = serverToken?.trim();

  if (!expectedToken) {
    return true;
  }

  const headerToken =
    readBearerToken(request.headers.authorization) ??
    readSingleHeader(request.headers["x-flash-erp-store-token"])?.trim() ??
    null;

  return headerToken === expectedToken;
}

function readTerminalContextFromHeaders(request: IncomingMessage): StoreTerminalContext | null {
  const terminalCode =
    readSingleHeader(request.headers["x-flash-erp-terminal-code"])?.trim() ?? "";
  const clientName = readSingleHeader(request.headers["x-flash-erp-terminal-name"])?.trim() ?? "";

  if (!terminalCode && !clientName) {
    return null;
  }

  return {
    terminalCode: terminalCode || null,
    clientName: clientName || null
  };
}

function getRequestMetadata(
  request: IncomingMessage,
  method: string | null,
  terminalContext: StoreTerminalContext | null
): StoreServiceRequestMetadata {
  return {
    method,
    remoteAddress: request.socket.remoteAddress ?? null,
    userAgent: readSingleHeader(request.headers["user-agent"]) ?? null,
    clientName:
      terminalContext?.clientName ??
      readSingleHeader(request.headers["x-flash-erp-terminal-name"]) ??
      null
  };
}

async function callLocalStoreService(
  service: StoreServiceRuntime,
  method: StoreServiceMethod,
  args: unknown[],
  terminalContext: StoreTerminalContext | null,
  requestMetadata?: StoreServiceRequestMetadata
) {
  const target = service as unknown as Record<string, (...methodArgs: unknown[]) => unknown>;
  const operation = target[method];

  if (typeof operation !== "function") {
    throw new Error(`Flash ERP store service does not expose ${method}.`);
  }

  return service.runWithTerminalContext(terminalContext, async () => {
    await Promise.resolve(service.recordTerminalHeartbeat({
      method: requestMetadata?.method ?? method,
      remoteAddress: requestMetadata?.remoteAddress ?? null,
      userAgent: requestMetadata?.userAgent ?? null,
      clientName: requestMetadata?.clientName ?? terminalContext?.clientName ?? null
    }));

    return operation.apply(service, args);
  });
}

export function createDirectStoreServiceClient(
  service: StoreServiceRuntime,
  terminalContext: StoreTerminalContext | null
): StoreServiceClient {
  return {
    call: (method, args = []) =>
      callLocalStoreService(service, method, args, terminalContext, {
        method,
        remoteAddress: "local",
        userAgent: "electron-main",
        clientName: terminalContext?.clientName ?? "Local desktop"
      })
  };
}

export function createHttpStoreServiceClient(input: {
  serverUrl: string;
  terminalContext: StoreTerminalContext | null;
  serverToken?: string | null;
  requestTimeoutMs?: number | null;
}): StoreServiceClient {
  const serverUrl = input.serverUrl.replace(/\/+$/, "");
  const requestTimeoutMs = input.requestTimeoutMs ?? 8000;

  return {
    async call(method, args = []) {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        response = await fetch(`${serverUrl}/api/store/${encodeURIComponent(method)}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(input.serverToken ? { "x-flash-erp-store-token": input.serverToken } : {}),
            ...(input.terminalContext?.terminalCode
              ? { "x-flash-erp-terminal-code": input.terminalContext.terminalCode }
              : {}),
            ...(input.terminalContext?.clientName
              ? { "x-flash-erp-terminal-name": input.terminalContext.clientName }
              : {})
          },
          body: JSON.stringify({
            args,
            terminalContext: input.terminalContext
          } satisfies StoreServiceRequest),
          signal: controller.signal
        });
      } catch (error) {
        throw new Error(
          error instanceof Error && error.name === "AbortError"
            ? `Flash ERP store server ${serverUrl} timed out after ${requestTimeoutMs} ms.`
            : error instanceof Error
            ? `Flash ERP could not reach store server ${serverUrl}: ${error.message}`
            : `Flash ERP could not reach store server ${serverUrl}.`
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        let message = `Flash ERP store server ${serverUrl} returned HTTP ${response.status}.`;

        try {
          const payload = (await response.json()) as StoreServiceResponse;

          if (!payload.ok) {
            message = payload.error.message;
          }
        } catch {
          // Keep the HTTP-level message when the server did not return JSON.
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as StoreServiceResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      return payload.data;
    }
  };
}

async function readJsonRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;

    if (size > 5 * 1024 * 1024) {
      throw new Error("Flash ERP store service request is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {} as StoreServiceRequest;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as StoreServiceRequest;
}

function writeJsonResponse(
  response: ServerResponse,
  status: number,
  payload: StoreServiceResponse | Record<string, unknown>
) {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  response.once("error", (error) => {
    console.warn(
      "Flash ERP store service response stream closed before JSON could be delivered.",
      error
    );
  });

  try {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(JSON.stringify(payload));
  } catch (error) {
    console.warn("Flash ERP store service could not write a JSON response.", error);

    if (!response.destroyed) {
      response.destroy();
    }
  }
}

export async function startStoreServiceServer(input: {
  service: StoreServiceRuntime;
  host: string;
  port: number;
  getHealth?: () => StoreServerHealth | Promise<StoreServerHealth>;
  serverToken?: string | null;
}): Promise<StoreServiceServerHandle> {
  if (input.host === "0.0.0.0" && !input.serverToken?.trim()) {
    console.warn(
      "Flash ERP store service is listening on all interfaces without FLASH_ERP_STORE_SERVER_TOKEN."
    );
  }

  const server: Server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (!isAuthorizedRequest(request, input.serverToken)) {
        writeJsonResponse(response, 401, {
          ok: false,
          error: {
            message: "Flash ERP store service rejected the request token.",
            name: "UnauthorizedError"
          }
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const terminalContext = readTerminalContextFromHeaders(request);

        if (terminalContext) {
          await Promise.resolve(
            input.service.runWithTerminalContext(terminalContext, async () => {
              await Promise.resolve(
                input.service.recordTerminalHeartbeat(
                  getRequestMetadata(request, "health", terminalContext)
                )
              );
            })
          );
        }

        writeJsonResponse(response, 200, {
          ok: true,
          data: input.getHealth
            ? await input.getHealth()
            : {
              status: "ready",
              role: "store-server",
              databaseProvider: "sqlite",
              storeCode: null,
              storeName: null,
              nodeCode: null,
              terminalCode: null,
              databasePath: input.service.databasePath,
              databaseSizeBytes: null,
              serviceStartedAt: null,
              uptimeSeconds: null,
              tokenRequired: Boolean(input.serverToken?.trim()),
              connectedTerminals: 0,
              openShifts: 0,
              upstreamQueued: 0,
              downstreamQueued: 0,
              deadLetter: 0,
              generatedAt: new Date().toISOString()
            }
        });
        return;
      }

      const match = url.pathname.match(/^\/api\/store\/([^/]+)$/);

      if (request.method !== "POST" || !match) {
        writeJsonResponse(response, 404, {
          ok: false,
          error: {
            message: "Flash ERP store service route was not found.",
            name: "NotFoundError"
          }
        });
        return;
      }

      const method = decodeURIComponent(match[1] ?? "");

      if (!isStoreServiceMethod(method)) {
        writeJsonResponse(response, 404, {
          ok: false,
          error: {
            message: `Flash ERP store service does not expose ${method}.`,
            name: "NotFoundError"
          }
        });
        return;
      }

      const body = await readJsonRequestBody(request);
      const terminalContext =
        body.terminalContext ?? readTerminalContextFromHeaders(request) ?? null;
      const data = await callLocalStoreService(
        input.service,
        method,
        Array.isArray(body.args) ? body.args : [],
        terminalContext,
        getRequestMetadata(request, method, terminalContext)
      );

      writeJsonResponse(response, 200, {
        ok: true,
        data: data ?? null
      });
    } catch (error) {
      writeJsonResponse(response, 500, {
        ok: false,
        error: serializeError(error)
      });
    }
  });

  server.on("clientError", (error, socket) => {
    console.warn("Flash ERP store service client connection failed.", error);
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, input.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : input.port;
  const hostForUrl = input.host === "0.0.0.0" ? "127.0.0.1" : input.host;

  return {
    url: `http://${hostForUrl}:${resolvedPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
