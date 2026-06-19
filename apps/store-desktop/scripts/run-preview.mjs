import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

function resolveElectronBinary() {
  const electronPackageJsonPath = require.resolve("electron/package.json");
  const electronPackageRoot = path.dirname(electronPackageJsonPath);
  const platformPath = fs
    .readFileSync(path.join(electronPackageRoot, "path.txt"), "utf8")
    .trim();
  const electronBinary = path.join(electronPackageRoot, "dist", platformPath);

  if (fs.existsSync(electronBinary)) {
    return electronBinary;
  }

  console.warn(
    `Electron binary is missing at ${electronBinary}. Reinstalling Electron runtime...`,
  );
  const installScript = path.join(electronPackageRoot, "install.js");
  const install = spawn(process.execPath, [installScript], {
    cwd: electronPackageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_SKIP_BINARY_DOWNLOAD: "",
      force_no_cache: "true",
    },
  });

  return new Promise((resolve, reject) => {
    install.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Electron runtime install failed with exit code ${code}.`),
        );
        return;
      }

      if (!fs.existsSync(electronBinary)) {
        reject(
          new Error(
            `Electron runtime install completed, but ${electronBinary} is still missing.`,
          ),
        );
        return;
      }

      resolve(electronBinary);
    });
    install.on("error", reject);
  });
}

const childEnvironment = {
  ...process.env,
  FLASH_ERP_DESKTOP_USE_DIST: "1"
};

delete childEnvironment.ELECTRON_RUN_AS_NODE;

const electronBinary = await resolveElectronBinary();
const child = spawn(electronBinary, ["."], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: childEnvironment
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exit(code);
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
