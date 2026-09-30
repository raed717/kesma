// MapLibre v6 resolves its web worker relative to its own module URL, which bundled
// Next.js chunks don't preserve. We serve the worker files from /public instead and
// point MapLibre at them with setWorkerUrl() (see src/components/map/maplibre-setup.ts).
// Files go in a versioned folder so a MapLibre upgrade never mixes cached files.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const distDir = join(dirname(pkgPath), "dist");
const outRoot = join(process.cwd(), "public", "vendor", "maplibre");
const outDir = join(outRoot, version);

if (existsSync(outRoot)) {
  for (const entry of readdirSync(outRoot)) {
    if (entry !== version) rmSync(join(outRoot, entry), { recursive: true, force: true });
  }
}
mkdirSync(outDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(distDir, file), join(outDir, file));
}
console.log(`[kesma] MapLibre ${version} worker copied to public/vendor/maplibre/${version}/`);
