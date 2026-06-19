import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const rawPort = process.env.PORT?.trim();
const port = rawPort && /^\d+$/.test(rawPort) ? rawPort : "3000";
const hostname = process.env.HOST?.trim() || "0.0.0.0";
const require = createRequire(import.meta.url);
const nextCliPath = require.resolve("next/dist/bin/next");

process.env.PORT = port;
process.argv = [process.execPath, nextCliPath, "start", "-p", port, "-H", hostname];

await import(pathToFileURL(nextCliPath).href);
