// NASA VIIRS Black Marble light features, sampled in the browser from NASA GIBS tiles.
// Mirrors ml/orbit_ml/viirs.py — the sampling plan must stay identical to training.

const TILE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

const RING_POINT = [8, [0.0, 0.7], 8];
const RING_NEAR = [8, [2, 4, 6, 8, 10], 12];
const RING_MID = [7, [15, 22, 30, 40, 50], 16];
const RING_FAR = [6, [65, 85, 110, 135, 160], 24];

const tileCache = new Map();

function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, 256, 256).data;
        const lum = new Float32Array(256 * 256);
        for (let i = 0; i < lum.length; i++) {
          const r = Math.pow(px[i * 4] / 255, 2.2);
          const g = Math.pow(px[i * 4 + 1] / 255, 2.2);
          const b = Math.pow(px[i * 4 + 2] / 255, 2.2);
          lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        resolve(lum);
      };
      img.onerror = () => resolve(new Float32Array(256 * 256));
      img.src = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }));
  }
  return tileCache.get(key);
}

function pixel(lat, lon, z) {
  lat = Math.max(Math.min(lat, 85), -85);
  const n = 2 ** z;
  const x = (lon + 180) / 360 * n * 256;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256;
  const W = n * 256;
  return [((Math.floor(x) % W) + W) % W, Math.min(Math.max(Math.floor(y), 0), W - 1)];
}

function offset(lat, lon, distKm, bearing) {
  const dlat = distKm / 111.32 * Math.cos(bearing);
  const dlon = distKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.05)) * Math.sin(bearing);
  return [lat + dlat, lon + dlon];
}

function ringPoints(lat, lon, [z, radii, nAng]) {
  const pts = [];
  for (const r of radii) {
    const angles = r === 0 ? [0] : Array.from({ length: nAng }, (_, i) => 2 * Math.PI * i / nAng);
    for (const a of angles) pts.push({ z, r, a, nAng, ll: offset(lat, lon, r, a) });
  }
  return pts;
}

async function sampleAll(points) {
  return Promise.all(points.map(async p => {
    const [px, py] = pixel(p.ll[0], p.ll[1], p.z);
    const lum = await loadTile(p.z, Math.floor(px / 256), Math.floor(py / 256));
    return lum[(py % 256) * 256 + (px % 256)];
  }));
}

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

export async function lightFeatures(lat, lon) {
  const plans = { point: RING_POINT, near: RING_NEAR, mid: RING_MID, far: RING_FAR };
  const pts = {};
  const vals = {};
  for (const [k, plan] of Object.entries(plans)) {
    pts[k] = ringPoints(lat, lon, plan);
    vals[k] = await sampleAll(pts[k]);
  }

  // Walker's law skyglow index (same weights as Python)
  let glow = 0;
  for (const k of ['near', 'mid', 'far']) {
    pts[k].forEach((p, i) => {
      const width = p.r <= 10 ? 2 : p.r <= 50 ? 8 : 22;
      const area = 2 * Math.PI * p.r * width / p.nAng;
      glow += vals[k][i] * area * Math.pow(Math.max(p.r, 1), -2.5);
    });
  }

  // Light per compass direction (for the telescope guide): brightest horizon = city dome
  const directions = Array.from({ length: 8 }, () => 0);
  for (const k of ['near', 'mid', 'far']) {
    pts[k].forEach((p, i) => {
      const sector = Math.round(((p.a * 180 / Math.PI) % 360) / 45) % 8;
      const width = p.r <= 10 ? 2 : p.r <= 50 ? 8 : 22;
      directions[sector] += vals[k][i] * (2 * Math.PI * p.r * width / p.nAng) * Math.pow(Math.max(p.r, 1), -2.5);
    });
  }

  return {
    light_point: mean(vals.point),
    light_10km: mean(vals.near),
    light_10_50km: mean(vals.mid),
    light_50_160km: mean(vals.far),
    skyglow_index: glow,
    directions
  };
}
