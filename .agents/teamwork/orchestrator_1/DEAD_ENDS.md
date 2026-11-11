# Dead Ends Log

| Iteration | Approach Tried | Why It Failed | Files Touched |
|-----------|---------------|---------------|---------------|
| M4 Iter 3 | Hooking only Webpack asset emission `outputFileSystem.mkdir` via `FixWindowsNtfsEpermPlugin` with `webpackBuildWorker: false` | Failed to resolve post-compilation App Router manifest reads (`pages-manifest.json`), `@vercel/nft` trace reads (`page.js.nft.json`), and concurrent internal typecheck (`.next/types/.../route.ts`), resulting in 4/7 build failures on Windows NTFS (`ENOENT`) | `apps/web/next.config.mjs` |
