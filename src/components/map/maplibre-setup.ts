import * as maplibregl from "maplibre-gl";

/**
 * Must run before the first map is created. The files are copied to /public by
 * `scripts/copy-maplibre-worker.mjs` (runs before `dev` and `build`).
 */
maplibregl.setWorkerUrl(`/vendor/maplibre/${maplibregl.getVersion()}/maplibre-gl-worker.mjs`);

export { maplibregl };
