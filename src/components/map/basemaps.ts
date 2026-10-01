import type { BasemapId } from "@/domain/model/project";
import { IMAGERY_TILE_URL } from "./imagery-fallback";

export type RasterLayerDef = {
  id: string;
  tiles: string[];
  tileSize: number;
  maxzoom: number;
  attribution: string;
};

/**
 * Tile providers are configuration, not code: swap URLs here (e.g. MapTiler with an API key).
 * ⚠️ Esri World Imagery is free with attribution for development and light use —
 * review Esri's terms before commercial deployment.
 */
const OSM: RasterLayerDef = {
  id: "osm",
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  maxzoom: 19,
  attribution: "© OpenStreetMap contributors",
};

const ESRI_IMAGERY: RasterLayerDef = {
  id: "esri-imagery",
  tiles: [
    // Custom protocol: magnifies the last available imagery instead of Esri's grey
    // "Map data not yet available" placeholder tiles at very high zoom.
    IMAGERY_TILE_URL,
  ],
  tileSize: 256,
  // Requested up to 21 (sharper where Esri has it); missing levels fall back to parents.
  maxzoom: 21,
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
};

const ESRI_LABELS: RasterLayerDef = {
  id: "esri-labels",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}?blankTile=false",
  ],
  tileSize: 256,
  maxzoom: 19,
  attribution: "Labels © Esri",
};

export const BASEMAPS: Record<BasemapId, RasterLayerDef[]> = {
  streets: [OSM],
  satellite: [ESRI_IMAGERY],
  hybrid: [ESRI_IMAGERY, ESRI_LABELS],
};

export const BASEMAP_IDS = Object.keys(BASEMAPS) as BasemapId[];

/** Initial view: Tunisia. */
export const DEFAULT_VIEW = { longitude: 9.6, latitude: 34.2, zoom: 6 } as const;
