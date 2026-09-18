import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const configIndex = process.argv.indexOf("--config");
const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : "";

if (!configPath) {
  throw new Error("The trial workspace service requires --config <workspace.env>.");
}

const loaded = dotenv.config({ path: path.resolve(configPath), override: true });
if (loaded.error) throw loaded.error;
if (process.env.FLASH_ERP_TRIAL_WORKSPACE_MODE !== "true") {
  throw new Error("The supplied environment is not marked as an isolated trial workspace.");
}

process.chdir(repositoryRoot);
await import("./run-enterprise-web-service.mjs");
