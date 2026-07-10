const deployBuild = process.env.FLASH_ERP_DEPLOY_BUILD === "1";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(deployBuild
    ? {
        typescript: {
          ignoreBuildErrors: true,
        },
        experimental: {
          cpus: parsePositiveInteger(process.env.FLASH_ERP_NEXT_BUILD_CPUS, 1),
          memoryBasedWorkersCount: false,
          parallelServerBuildTraces: false,
          parallelServerCompiles: false,
          webpackMemoryOptimizations: true,
        },
      }
    : {}),
};

export default nextConfig;
