// ORBIT AI v2 — NASA Black Marble VNP46A4 (2024 calibrated radiance) for Iraq.
// Radiance comes from a log-scaled 8-bit PNG exported by ml/06_blackmarble_v2.py;
// sampling mirrors ml/orbit_ml/blackmarble.py exactly (same rings, windows, quantisation).
// Outside the raster, the app falls back to model v1 (NASA GIBS 2016, global).

import { SkyModel, geoSeason } from './skyModel.js';
import { moonIllumination, moonPosition, sunPosition } from './astro.js';

const RINGS = {
  point: [[0.0, 0.5], 8, 0],
  near: [[2, 4, 6, 8, 10], 12, 0],
  mid: [[15, 22, 30, 40, 50], 16, 1],
  far: [[65, 85, 110, 135, 160], 24, 1]
};

export class SkyModelV2 extends SkyModel {
  async load(base = import.meta.env.BASE_URL) {
    const res = await fetch(`${base}model/sky_model_v2.json`);
    if (!res.ok) throw new Error('no v2 model');
    this.model = await res.json();
    const r = this.model.raster;
    const img = new Image();
    img.src = `${base}${r.file}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    this.W = c.width;
    this.H = c.height;
    // dequantised radiance per pixel (nW/cm²/sr)
    const lut = new Float32Array(256);
    for (let q = 0; q < 256; q++) lut[q] = Math.max(Math.pow(10, q / 255 * (r.q_hi - r.q_lo) + r.q_lo) - r.q_eps, 0);
    this.rad = new Float32Array(this.W * this.H);
    for (let i = 0; i < this.rad.length; i++) this.rad[i] = lut[rgba[i * 4]];
    return this;
  }

  // True when every ring sample (out to 160 km) falls inside the Iraq raster
  covers(lat, lon) {
    const r = this.model.raster;
    const dLat = 161 / 111.32;
    const dLon = 161 / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.05));
    return lat - dLat > r.lat_min && lat + dLat < r.lat_max && lon - dLon > r.lon_min && lon + dLon < r.lon_max;
  }

  sample(lat, lon, win) {
    const r = this.model.raster;
    const row = Math.floor((r.lat_max - lat) / r.deg_per_px);
    const col = Math.floor((lon - r.lon_min) / r.deg_per_px);
    let s = 0, n = 0;
    for (let y = Math.max(row - win, 0); y <= Math.min(row + win, this.H - 1); y++) {
      for (let x = Math.max(col - win, 0); x <= Math.min(col + win, this.W - 1); x++) { s += this.rad[y * this.W + x]; n++; }
    }
    return n ? s / n : 0;
  }

  radianceFeatures(lat, lon) {
    const off = (d, a) => [lat + d / 111.32 * Math.cos(a), lon + d / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.05)) * Math.sin(a)];
    const pts = {};
    for (const [k, [radii, nAng, win]] of Object.entries(RINGS)) {
      pts[k] = [];
      for (const d of radii) {
        const angles = d === 0 ? [0] : Array.from({ length: nAng }, (_, i) => 2 * Math.PI * i / nAng);
        for (const a of angles) pts[k].push({ d, a, nAng, v: this.sample(...off(d, a), win) });
      }
    }
    const mean = k => pts[k].reduce((s, p) => s + p.v, 0) / pts[k].length;
    let glow = 0;
    const directions = Array(8).fill(0);
    for (const k of ['near', 'mid', 'far']) {
      for (const p of pts[k]) {
        const width = p.d <= 10 ? 2 : p.d <= 50 ? 8 : 22;
        const w = p.v * (2 * Math.PI * p.d * width / p.nAng) * Math.pow(Math.max(p.d, 1), -2.5);
        glow += w;
        directions[Math.round(((p.a * 180 / Math.PI) % 360) / 45) % 8] += w;
      }
    }
    return {
      rad_point: mean('point'), rad_10km: mean('near'), rad_10_50km: mean('mid'),
      rad_50_160km: mean('far'), rad_skyglow: glow, directions
    };
  }

  async buildInputs(opts) {
    return this.inputsFor(opts);
  }

  inputsFor({ lat, lon, elevationM, date = new Date(), cloud = 0, light = null }) {
    const L = light || this.radianceFeatures(lat, lon);
    const eps = this.model.raster.q_eps;
    const moon = moonPosition(date, lat, lon);
    const illum = moonIllumination(date);
    const moonAlt = Math.max(-10, Math.min(90, moon.alt));
    const h = ((date.valueOf() / 3600000 + lon / 15) % 24 + 24) % 24;
    return {
      light: L,
      moon: { alt: moon.alt, az: moon.az, illum },
      x: {
        log_rad_point: Math.log10(L.rad_point + eps),
        log_rad_10km: Math.log10(L.rad_10km + eps),
        log_rad_10_50km: Math.log10(L.rad_10_50km + eps),
        log_rad_50_160km: Math.log10(L.rad_50_160km + eps),
        log_rad_skyglow: Math.log10(L.rad_skyglow + eps),
        elevation_km: elevationM / 1000,
        moon_illum: illum,
        moon_alt: moonAlt,
        moon_light: illum * Math.max(0, Math.sin(moonAlt * Math.PI / 180)),
        cloud,
        sun_alt: sunPosition(date, lat, lon).alt,
        solar_hour: ((h + 12) % 24) - 12,
        ...geoSeason(date, lat)
      }
    };
  }

  predictWithLightFactor(inputs, factor) {
    const L = inputs.light;
    const eps = this.model.raster.q_eps;
    return Math.max(16, Math.min(22.3, this.predictVector({
      ...inputs.x,
      log_rad_point: Math.log10(L.rad_point * factor + eps),
      log_rad_10km: Math.log10(L.rad_10km * factor + eps),
      log_rad_10_50km: Math.log10(L.rad_10_50km * factor + eps),
      log_rad_50_160km: Math.log10(L.rad_50_160km * factor + eps),
      log_rad_skyglow: Math.log10(L.rad_skyglow * factor + eps)
    })));
  }
}
