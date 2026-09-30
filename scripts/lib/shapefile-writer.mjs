// Minimal ESRI Shapefile writer (Polygon type + dBase III attributes).
// Used to generate sample files and test fixtures — not part of the app bundle.

/**
 * @param {{ rings: number[][][], properties: Record<string, string> }[]} features
 *   rings in the target CRS; the first ring is the outer boundary.
 * @param {string[]} fields attribute names (<= 10 chars), all written as text (C) fields
 * @returns {{ shp: Uint8Array, shx: Uint8Array, dbf: Uint8Array, cpg: string }}
 */
export function writePolygonShapefile(features, fields) {
  const records = features.map((f) =>
    f.rings.map((ring, i) => orient(closeRing(ring), i === 0 ? "cw" : "ccw")),
  );

  const recordContent = records.map((rings) => {
    const numPoints = rings.reduce((n, r) => n + r.length, 0);
    const size = 4 + 32 + 4 + 4 + 4 * rings.length + 16 * numPoints;
    const view = new DataView(new ArrayBuffer(size));
    const box = bbox(rings.flat());
    view.setInt32(0, 5, true);
    box.forEach((v, i) => view.setFloat64(4 + i * 8, v, true));
    view.setInt32(36, rings.length, true);
    view.setInt32(40, numPoints, true);
    let offset = 44;
    let start = 0;
    for (const ring of rings) {
      view.setInt32(offset, start, true);
      offset += 4;
      start += ring.length;
    }
    for (const [x, y] of rings.flat()) {
      view.setFloat64(offset, x, true);
      view.setFloat64(offset + 8, y, true);
      offset += 16;
    }
    return new Uint8Array(view.buffer);
  });

  const allPoints = records.flat(2);
  const fileBox = bbox(allPoints);
  const shpLength = 100 + recordContent.reduce((n, c) => n + 8 + c.length, 0);
  const shxLength = 100 + 8 * records.length;

  const shp = new Uint8Array(shpLength);
  const shx = new Uint8Array(shxLength);
  writeHeader(new DataView(shp.buffer), shpLength, fileBox);
  writeHeader(new DataView(shx.buffer), shxLength, fileBox);

  const shpView = new DataView(shp.buffer);
  const shxView = new DataView(shx.buffer);
  let offset = 100;
  recordContent.forEach((content, i) => {
    shxView.setInt32(100 + i * 8, offset / 2, false);
    shxView.setInt32(104 + i * 8, content.length / 2, false);
    shpView.setInt32(offset, i + 1, false);
    shpView.setInt32(offset + 4, content.length / 2, false);
    shp.set(content, offset + 8);
    offset += 8 + content.length;
  });

  return {
    shp,
    shx,
    dbf: writeDbf(
      features.map((f) => f.properties),
      fields,
    ),
    cpg: "UTF-8",
  };
}

function writeHeader(view, byteLength, [xmin, ymin, xmax, ymax]) {
  view.setInt32(0, 9994, false);
  view.setInt32(24, byteLength / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 5, true);
  [xmin, ymin, xmax, ymax].forEach((v, i) => view.setFloat64(36 + i * 8, v, true));
}

function writeDbf(rows, fields) {
  const enc = new TextEncoder();
  const encoded = rows.map((row) => fields.map((f) => enc.encode(String(row[f] ?? ""))));
  const lengths = fields.map((_, i) =>
    Math.min(254, Math.max(1, ...encoded.map((r) => r[i].length))),
  );
  const headerLength = 32 + 32 * fields.length + 1;
  const recordLength = 1 + lengths.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(headerLength + recordLength * rows.length + 1);
  const view = new DataView(out.buffer);
  const now = new Date();
  out[0] = 0x03;
  out[1] = now.getFullYear() - 1900;
  out[2] = now.getMonth() + 1;
  out[3] = now.getDate();
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  fields.forEach((name, i) => {
    const base = 32 + i * 32;
    out.set(enc.encode(name.slice(0, 10)), base);
    out[base + 11] = "C".charCodeAt(0);
    out[base + 16] = lengths[i];
  });
  out[headerLength - 1] = 0x0d;
  encoded.forEach((values, r) => {
    let offset = headerLength + r * recordLength;
    out[offset++] = 0x20;
    values.forEach((bytes, i) => {
      out.fill(0x20, offset, offset + lengths[i]);
      out.set(bytes.subarray(0, lengths[i]), offset);
      offset += lengths[i];
    });
  });
  out[out.length - 1] = 0x1a;
  return out;
}

function closeRing(ring) {
  const [f, l] = [ring[0], ring[ring.length - 1]];
  return f[0] === l[0] && f[1] === l[1] ? ring : [...ring, f];
}

/** Shapefile convention: outer rings clockwise, holes counter-clockwise. */
function orient(ring, want) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  const isClockwise = sum > 0;
  return (want === "cw") === isClockwise ? ring : [...ring].reverse();
}

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
