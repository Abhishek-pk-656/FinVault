import fs from "node:fs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@finvault/ui", "@finvault/sync-engine", "@finvault/db-types"],
  reactStrictMode: true,
  // Disable output file tracing (@vercel/nft) to eliminate trace file read/write collisions on Windows NTFS
  // (Prevents ENOENT on .next/server/app/_not-found/page.js.nft.json and .next/server/src/middleware.js)
  outputFileTracing: false,
  // Delegate typecheck and lint to dedicated deterministic tasks (pnpm typecheck & pnpm lint)
  // Eliminates race condition where Next.js scans .next/types before Webpack finishes writing route.ts
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Run Webpack in the main process to prevent chunk directory EPERM/EEXIST collisions
    webpackBuildWorker: false,
    // Restrict static generation and page data collection to 1 worker to eliminate multi-worker manifest races
    // (Prevents pages-manifest.json and middleware-manifest.json ENOENT / MODULE_NOT_FOUND on Windows NTFS)
    cpus: 1,
    workerThreads: false,
  },
  webpack: (config) => {
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.beforeRun.tap("FixWindowsNtfsEpermPlugin", (comp) => {
          if (comp.outputFileSystem && comp.outputFileSystem.mkdir) {
            const origMkdir = comp.outputFileSystem.mkdir.bind(comp.outputFileSystem);
            comp.outputFileSystem.mkdir = (dir, ...args) => {
              const cb = args.pop();
              origMkdir(dir, ...args, (err, ...res) => {
                if (err && (err.code === "EPERM" || err.code === "EEXIST")) {
                  if (fs.existsSync(dir)) {
                    return cb(null, ...res);
                  }
                  try {
                    fs.mkdirSync(dir, { recursive: true });
                    return cb(null, ...res);
                  } catch (e) {
                    if (e && (e.code === "EEXIST" || fs.existsSync(dir))) {
                      return cb(null, ...res);
                    }
                  }
                }
                cb(err, ...res);
              });
            };
          }
        });
      },
    });
    return config;
  },
};

export default nextConfig;
