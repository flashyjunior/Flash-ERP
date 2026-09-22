const deployBuild = process.env.FLASH_ERP_DEPLOY_BUILD === "1";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Ecommerce uploads have immutable, generated filenames. Keeping optimized
    // derivatives lets repeat storefront visits avoid image reprocessing.
    minimumCacheTTL: 31_536_000,
  },
  async headers() {
    return [
      {
        source: "/uploads/ecommerce/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  ...(deployBuild
    ? {
        output: "standalone",
        typescript: {
          ignoreBuildErrors: true,
        },
        experimental: {
          cpus: parsePositiveInteger(process.env.FLASH_ERP_NEXT_BUILD_CPUS, 1),
          memoryBasedWorkersCount: false,
          parallelServerBuildTraces: false,
          parallelServerCompiles: false,
          // Next 16 can intermittently lose its async context while exporting a
          // page. Retry the isolated prerender before failing the deploy build.
          staticGenerationRetryCount: 3,
          webpackMemoryOptimizations: true,
        },
      }
    : {}),
};

export default nextConfig;
