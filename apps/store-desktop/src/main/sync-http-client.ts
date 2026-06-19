import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

export type SyncHttpFailureKind = "TIMEOUT" | "NETWORK" | "OVERSIZED";

export class SyncHttpClientError extends Error {
  constructor(
    message: string,
    readonly failureKind: SyncHttpFailureKind,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "SyncHttpClientError";
  }
}

export type SyncHttpResponse = {
  body: string;
  statusCode: number;
};

function readEffectiveSyncHttpTimeoutMs(defaultTimeoutMs: number) {
  const parsed = Number(process.env.FLASH_ERP_ENTERPRISE_SYNC_HTTP_TIMEOUT_MS);

  if (Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 30_000) {
    return parsed;
  }

  return defaultTimeoutMs;
}

export async function postSyncJsonRaw(
  url: string,
  body: unknown,
  options: {
    maxResponseBytes: number;
    timeoutMessage: string;
    timeoutMs: number;
    oversizedMessage: (limitBytes: number, contentLength?: number | null) => string;
  },
): Promise<SyncHttpResponse> {
  const payloadJson = JSON.stringify(body);
  const payload = Buffer.from(payloadJson, "utf8");
  const timeoutMs = readEffectiveSyncHttpTimeoutMs(options.timeoutMs);
  const parsedUrl = new URL(url);
  const request = parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SyncHttpClientError(`Unsupported enterprise sync URL protocol: ${parsedUrl.protocol}`, "NETWORK");
  }

  return await new Promise<SyncHttpResponse>((resolve, reject) => {
    let settled = false;
    let receivedBytes = 0;
    let wallClockTimeout: NodeJS.Timeout | null = null;
    const chunks: Buffer[] = [];

    const finish = (error: Error | null, response?: SyncHttpResponse) => {
      if (settled) {
        return;
      }

      settled = true;

      if (wallClockTimeout) {
        clearTimeout(wallClockTimeout);
        wallClockTimeout = null;
      }

      if (error) {
        if (error instanceof SyncHttpClientError) {
          reject(error);
          return;
        }

        reject(new SyncHttpClientError(error.message || "Enterprise sync request failed.", "NETWORK"));
        return;
      }

      resolve(response ?? { body: "", statusCode: 0 });
    };

    const req = request(
      parsedUrl,
      {
        headers: {
          "content-type": "application/json",
          "content-length": String(payload.byteLength),
        },
        method: "POST",
        timeout: timeoutMs,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const contentLength = Number(response.headers["content-length"]);

        if (
          Number.isFinite(contentLength) &&
          contentLength > options.maxResponseBytes
        ) {
          response.destroy();
          finish(
            new SyncHttpClientError(
              options.oversizedMessage(options.maxResponseBytes, contentLength),
              "OVERSIZED",
              statusCode,
            ),
          );
          return;
        }

        response.on("data", (chunk: Buffer | string) => {
          if (settled) {
            return;
          }

          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.byteLength;

          if (receivedBytes > options.maxResponseBytes) {
            response.destroy();
            finish(
              new SyncHttpClientError(
                options.oversizedMessage(options.maxResponseBytes, null),
                "OVERSIZED",
                statusCode,
              ),
            );
            return;
          }

          chunks.push(buffer);
        });

        response.once("end", () => {
          finish(null, {
            body: Buffer.concat(chunks).toString("utf8"),
            statusCode,
          });
        });

        response.once("aborted", () => {
          finish(new SyncHttpClientError("Enterprise sync response ended before it completed.", "NETWORK", statusCode));
        });
      },
    );

    wallClockTimeout = setTimeout(() => {
      req.destroy(new SyncHttpClientError(options.timeoutMessage, "TIMEOUT"));
    }, timeoutMs);

    req.once("timeout", () => {
      req.destroy(new SyncHttpClientError(options.timeoutMessage, "TIMEOUT"));
    });

    req.once("error", (error) => {
      finish(error);
    });

    req.end(payload);
  });
}
