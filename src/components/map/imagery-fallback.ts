/**
 * Satellite imagery that keeps showing the deepest available tiles.
 *
 * Esri World Imagery does not fail on zoom levels it has no imagery for: it returns a
 * grey "Map data not yet available" placeholder (HTTP 200, byte-identical everywhere).
 * This protocol recognises that placeholder and instead enlarges the matching quarter of
 * the parent tile — walking up as many levels as needed — so zooming in shows the last
 * real imagery, magnified. It works per tile, so it also works when a page is reloaded
 * already zoomed in (nothing relies on cached parents).
 *
 * (`?blankTile=false` would return 404 instead, but Esri's 404s carry no CORS headers: the
 * browser blocks them and logs an error per tile.)
 */

export const IMAGERY_PROTOCOL = "kesma-imagery";
export const IMAGERY_TILE_URL = `${IMAGERY_PROTOCOL}://{z}/{y}/{x}`;
const ESRI_URL = (z: number, y: number, x: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** SHA-256 of Esri's placeholder tile (2521 bytes) as of 2026-10. */
const KNOWN_PLACEHOLDER_SHA256 = "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";
/** A tile that never has imagery (zoom 23, Arctic Ocean): used to learn the placeholder at runtime. */
const PROBE_TILE = { z: 23, y: 0, x: 0 };

/** How far up we look for real imagery (8 levels = up to 256× magnification). */
export const MAX_FALLBACK_LEVELS = 8;

export type TileRef = { z: number; y: number; x: number };

/** The tile itself, then its ancestors, up to `maxLevels` levels up. */
export function ancestorChain(
  { z, y, x }: TileRef,
  maxLevels = MAX_FALLBACK_LEVELS,
): (TileRef & { dz: number })[] {
  const chain: (TileRef & { dz: number })[] = [];
  for (let dz = 0; dz <= maxLevels && z - dz >= 0; dz++) {
    chain.push({ z: z - dz, y: y >> dz, x: x >> dz, dz });
  }
  return chain;
}

/** Source rectangle (in pixels of the ancestor image) covering tile (x, y) `dz` levels down. */
export function cropRect(x: number, y: number, dz: number, size: number) {
  const f = 2 ** dz;
  const s = size / f;
  return { sx: (x % f) * s, sy: (y % f) * s, sw: s, sh: s };
}

// ---------- browser-only part ----------

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Fingerprint = { size: number; sha: string };
let learned: Promise<Fingerprint | null> | null = null;
/** Learns the current placeholder once (in case Esri changes it); falls back to the known one. */
function learnedPlaceholder(): Promise<Fingerprint | null> {
  learned ??= fetch(ESRI_URL(PROBE_TILE.z, PROBE_TILE.y, PROBE_TILE.x))
    .then(async (r) => {
      if (!r.ok) return null;
      const blob = await r.blob();
      return { size: blob.size, sha: await sha256Hex(blob) };
    })
    .catch(() => null);
  return learned;
}

async function isPlaceholder(blob: Blob): Promise<boolean> {
  // Real imagery tiles are almost never this small: only hash candidates of the right size.
  const probe = await learnedPlaceholder();
  if (blob.size !== 2521 && blob.size !== probe?.size) return false;
  const sha = await sha256Hex(blob);
  return sha === KNOWN_PLACEHOLDER_SHA256 || sha === probe?.sha;
}

/** Small LRU of fetched tiles (null = no imagery at that tile). */
const cache = new Map<string, Promise<Blob | null>>();
const CACHE_LIMIT = 300;

function fetchEsri({ z, y, x }: TileRef): Promise<Blob | null> {
  const key = `${z}/${y}/${x}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // refresh LRU position
    return hit;
  }
  const promise = fetch(ESRI_URL(z, y, x))
    .then(async (r) => {
      if (!r.ok) return null;
      const blob = await r.blob();
      return (await isPlaceholder(blob)) ? null : blob;
    })
    .catch(() => {
      cache.delete(key); // network error: allow a retry later
      return null;
    });
  cache.set(key, promise);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return promise;
}

async function magnify(blob: Blob, tile: TileRef, dz: number): Promise<ArrayBuffer> {
  const image = await createImageBitmap(blob);
  const size = image.width;
  const { sx, sy, sw, sh } = cropRect(tile.x, tile.y, dz, size);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
  image.close();
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return out.arrayBuffer();
}

/** MapLibre protocol handler: `kesma-imagery://{z}/{y}/{x}`. */
export async function loadImageryTile(
  url: string,
  signal: AbortSignal,
): Promise<{ data: ArrayBuffer }> {
  const m = url.match(/^kesma-imagery:\/\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) throw new Error(`Bad imagery URL: ${url}`);
  const tile = { z: Number(m[1]), y: Number(m[2]), x: Number(m[3]) };
  for (const ancestor of ancestorChain(tile)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const blob = await fetchEsri(ancestor);
    if (!blob) continue;
    return {
      data: ancestor.dz === 0 ? await blob.arrayBuffer() : await magnify(blob, tile, ancestor.dz),
    };
  }
  throw new Error(`No imagery for ${tile.z}/${tile.y}/${tile.x}`);
}
