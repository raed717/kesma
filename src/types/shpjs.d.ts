declare module "shpjs" {
  type Buffer = ArrayBuffer | ArrayBufferView | DataView;
  /** Parses a .shp buffer. Without `prj`, coordinates are returned untouched (source CRS). */
  export function parseShp(shp: Buffer, prj?: string | false): GeoJSON.Geometry[];
  export function parseDbf(dbf: Buffer, cpg?: Buffer | string): Record<string, unknown>[];
  export function combine(
    parts: [GeoJSON.Geometry[], Record<string, unknown>[]?],
  ): GeoJSON.FeatureCollection;
}
