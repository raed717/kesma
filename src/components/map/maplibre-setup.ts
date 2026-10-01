import * as maplibregl from "maplibre-gl";
import { IMAGERY_PROTOCOL, loadImageryTile } from "./imagery-fallback";

/**
 * Must run before the first map is created. The files are copied to /public by
 * `scripts/copy-maplibre-worker.mjs` (runs before `dev` and `build`).
 */
maplibregl.setWorkerUrl(`/vendor/maplibre/${maplibregl.getVersion()}/maplibre-gl-worker.mjs`);

// Satellite tiles that fall back to magnified parent imagery where Esri has none (see imagery-fallback.ts).
maplibregl.addProtocol(IMAGERY_PROTOCOL, (params, abort) =>
  loadImageryTile(params.url, abort.signal),
);

export { maplibregl };
