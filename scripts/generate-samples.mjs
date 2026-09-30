// Generates sample property files in every supported import format into ./samples.
// Run: node scripts/generate-samples.mjs
//
// The property is defined in Carthage / Nord Tunisie metres (EPSG:22391), so its exact
// planar area is known, then converted to WGS84 for the lon/lat formats.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import proj4 from "proj4";
import { writePolygonShapefile } from "./lib/shapefile-writer.mjs";

const EPSG_22391 =
  "+proj=lcc +lat_1=36 +lat_0=36 +lon_0=9.9 +k_0=0.999625544 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=-263,6,431,0,0,0,0 +units=m +no_defs";
const PRJ_22391 =
  'PROJCS["Carthage_Nord_Tunisie",GEOGCS["GCS_Carthage",DATUM["D_Carthage",SPHEROID["Clarke_1880_IGN",6378249.2,293.4660212936269]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",300000.0],PARAMETER["Central_Meridian",9.9],PARAMETER["Standard_Parallel_1",36.0],PARAMETER["Scale_Factor",0.999625544],PARAMETER["Latitude_Of_Origin",36.0],UNIT["Meter",1.0]]';

proj4.defs("EPSG:22391", EPSG_22391);
const toWgs = proj4("EPSG:22391", "EPSG:4326");

// Farmland near Mornag (Ben Arous). Origin chosen from a WGS84 point.
const [ox, oy] = proj4("EPSG:4326", "EPSG:22391", [10.2865, 36.6561]).map(Math.round);
const offset = (pts) => pts.map(([dx, dy]) => [ox + dx, oy + dy]);

/** Irregular agricultural parcel, ~9.8 ha. */
const farmland = offset([
  [0, 0],
  [310, -12],
  [335, 290],
  [150, 330],
  [-18, 300],
  [0, 0],
]);
/** Family house plot on the road side, ~0.3 ha, adjacent to the farmland's south edge. */
const housePlot = offset([
  [60, -2],
  [120, -5],
  [118, -55],
  [58, -52],
  [60, -2],
]);

const parcels = [
  {
    name: "Terre agricole — Henchir",
    nameAr: "أرض فلاحية — هنشير",
    ring: farmland,
    landuse: "agricultural",
  },
  { name: "Maison familiale", nameAr: "دار العائلة", ring: housePlot, landuse: "residential" },
];

function planarArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++)
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const toLngLat = (ring) => ring.map((p) => toWgs.forward(p).map((v) => round(v, 7)));

const outDir = join(process.cwd(), "samples");
mkdirSync(outDir, { recursive: true });
const write = (name, data) => writeFileSync(join(outDir, name), data);

// 1. GeoJSON (WGS84)
const geojson = {
  type: "FeatureCollection",
  features: parcels.map((p) => ({
    type: "Feature",
    properties: { name: p.name, landuse: p.landuse },
    geometry: { type: "Polygon", coordinates: [toLngLat(p.ring)] },
  })),
};
write("01-ben-ali-property.geojson", JSON.stringify(geojson, null, 2));

// 2. KML + 3. KMZ (WGS84)
const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Propriété Ben Ali</name>
${parcels
  .map(
    (p) => `    <Placemark>
      <name>${p.name}</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        ${toLngLat(p.ring)
          .map(([x, y]) => `${x},${y},0`)
          .join(" ")}
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`,
  )
  .join("\n")}
  </Document>
</kml>
`;
write("02-ben-ali-property.kml", kml);
const kmz = new JSZip();
kmz.file("doc.kml", kml);
write("03-ben-ali-property.kmz", await kmz.generateAsync({ type: "uint8array" }));

// 4. Shapefile in Carthage / Nord Tunisie, with .prj and UTF-8 Arabic names
const shp = writePolygonShapefile(
  parcels.map((p) => ({ rings: [p.ring], properties: { NOM: p.name, NOM_AR: p.nameAr } })),
  ["NOM", "NOM_AR"],
);
const shpZip = new JSZip();
shpZip.file("parcelles.shp", shp.shp);
shpZip.file("parcelles.shx", shp.shx);
shpZip.file("parcelles.dbf", shp.dbf);
shpZip.file("parcelles.cpg", shp.cpg);
shpZip.file("parcelles.prj", PRJ_22391);
write("04-ben-ali-shapefile-carthage-nord.zip", await shpZip.generateAsync({ type: "uint8array" }));

// 5. CSV of surveyed boundary points, Carthage / Nord Tunisie, French Excel style (; and ,)
const csv = [
  "Point;X;Y",
  ...farmland
    .slice(0, -1)
    .map(
      ([x, y], i) =>
        `B${i + 1};${String(x.toFixed(2)).replace(".", ",")};${String(y.toFixed(2)).replace(".", ",")}`,
    ),
].join("\r\n");
write("05-ben-ali-boundary-carthage-nord.csv", csv);

// 6. GPX track walked around the boundary (WGS84), with a little GPS noise
const walk = toLngLat(farmland).map(([x, y], i) => [x + (i % 2 ? 0.000004 : -0.000003), y]);
const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KESMA samples" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Tour de la parcelle</name><trkseg>
${walk.map(([x, y]) => `    <trkpt lat="${y}" lon="${x}"></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>
`;
write("06-ben-ali-boundary-walk.gpx", gpx);

// Reference values for manual checks
const reference = parcels.map((p) => ({
  name: p.name,
  planarAreaM2_EPSG22391: round(planarArea(p.ring), 1),
}));
write(
  "README.md",
  `# Sample import files

Generated by \`node scripts/generate-samples.mjs\`. Same property in every format (near Mornag, Ben Arous).

| File | Format | CRS | Content |
| --- | --- | --- | --- |
| 01-ben-ali-property.geojson | GeoJSON | WGS84 | 2 parcels |
| 02-ben-ali-property.kml | KML | WGS84 | 2 parcels |
| 03-ben-ali-property.kmz | KMZ | WGS84 | 2 parcels |
| 04-ben-ali-shapefile-carthage-nord.zip | Shapefile | EPSG:22391 (.prj) | 2 parcels, Arabic names (UTF-8 .cpg) |
| 05-ben-ali-boundary-carthage-nord.csv | CSV (\`;\` + decimal comma) | none declared → pick EPSG:22391 | farmland boundary points |
| 06-ben-ali-boundary-walk.gpx | GPX track | WGS84 | farmland boundary walked with GPS |

Reference planar areas in EPSG:22391 (geodesic area in KESMA differs by the projection scale factor, < 0.1%):

${reference.map((r) => `- ${r.name}: ${r.planarAreaM2_EPSG22391} m²`).join("\n")}
`,
);

console.log(`[kesma] samples written to ${outDir}`);
console.log(reference);
