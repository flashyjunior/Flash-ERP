const updateUrl = "https://updates.flashcodesolutions.com/flash-erp/store-desktop/";

module.exports = {
  appId: "com.flashcodesolutions.erp.storedesktop",
  productName: "Flash ERP Store Desktop",
  electronVersion: "38.1.0",
  artifactName: "${productName}-${version}-${arch}.${ext}",
  directories: {
    output: "release"
  },
  files: [
    "build/**/*",
    "dist/**/*",
    "dist-electron/**/*",
    "package.json"
  ],
  extraResources: [
    {
      from: "../../node_modules/node/bin/node.exe",
      to: "sync-node/node.exe"
    },
    {
      from: "dist-electron/src",
      to: "sync-runtime/dist-electron/src"
    },
    {
      from: "sync-runtime-package.json",
      to: "sync-runtime/package.json"
    },
    {
      from: "sync-runtime-node_modules",
      to: "sync-runtime/node_modules",
      filter: ["**/*"]
    }
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node"
  ],
  extraMetadata: {
    main: "dist-electron/electron/bootstrap.js"
  },
  publish: [
    {
      provider: "generic",
      url: updateUrl
    }
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "build/app-icon.ico"
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Flash ERP Store Desktop"
  },
  linux: {
    target: ["AppImage"],
    icon: "build/app-icon.png",
    category: "Office"
  }
};
