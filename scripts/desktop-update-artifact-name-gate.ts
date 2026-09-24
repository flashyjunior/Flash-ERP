import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const rootPackage = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as {
  allowScripts?: Record<string, boolean>;
};
const builderConfig = require(
  path.resolve("apps/store-desktop/electron-builder.config.cjs"),
) as {
  appId?: string;
  productName?: string;
  artifactName?: string;
  publish?: Array<{ provider?: string; url?: string }>;
  nsis?: { shortcutName?: string };
};

assert.equal(builderConfig.appId, "com.flashcodesolutions.erp.storedesktop");
assert.equal(builderConfig.productName, "Flash ERP Store Desktop");
assert.equal(builderConfig.nsis?.shortcutName, "Flash ERP Store Desktop");
assert.equal(
  builderConfig.artifactName,
  "Flash_ERP_Store_Desktop-${version}-${arch}.${ext}",
);
assert.doesNotMatch(builderConfig.artifactName ?? "", /\s/);
assert.deepEqual(builderConfig.publish, [
  {
    provider: "generic",
    url: "https://flashcodesolutions.com.gh/rms-update/erp/",
  },
]);
assert.equal(rootPackage.allowScripts?.["electron@38.8.6"], true);
assert.equal(rootPackage.allowScripts?.["node@24.16.0"], true);

const updaterSource = readFileSync(
  path.resolve("apps/store-desktop/electron/main.ts"),
  "utf8",
);

assert.match(updaterSource, /autoUpdater\.setFeedURL\(/);
assert.match(updaterSource, /autoUpdater\.checkForUpdates\(\)/);
assert.match(updaterSource, /autoUpdater\.downloadUpdate\(\)/);
assert.match(
  updaterSource,
  /https:\/\/flashcodesolutions\.com\.gh\/rms-update\/erp\//,
);
assert.doesNotMatch(
  updaterSource,
  /Flash(?:_| )ERP(?:_| )Store(?:_| )Desktop-\$\{version\}/,
);

console.log("Desktop update artifact naming acceptance passed.");
