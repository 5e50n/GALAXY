// ORBIT AI sky-quality model — runs the trained model (exported by ml/03_train.py) in the browser.
// Features are built exactly like ml/orbit_ml/features.py.

import { moonIllumination, moonPosition, sunPosition } from './astro.js';
import { lightFeatures } from './viirs.js';

const LOG_EPS = 1e-4;
const log10 = x => Math.log10(x + LOG_EPS);

export class SkyModel {
  constructor() {
    this.model = null;
    this.localCalibration = null;
  }

  async load(base = import.meta.env.BASE_URL) {
    const res = await fetch(`${base}model/sky_model.json`);
    this.model = await res.json();
    try {
      const c = await fetch(`${base}model/local_calibration.json`);
      if (c.ok) this.localCalibration = await c.json();
    } catch { /* optional file */ }
    return this;
  }

  get metrics() { return this.model?.metrics; }
  get importances() { return this.model?.importances; }

  // Build the model input dict for a place/time
  async buildInputs(opts) {
    return this.inputsFor({ ...opts, light: opts.light || await lightFeatures(opts.lat, opts.lon) });
  }

  // Same as buildInputs, synchronous, when the light features are already known
  inputsFor({ lat, lon, elevationM, date = new Date(), cloud = 0, light }) {
    const L = light;
    const moon = moonPosition(date, lat, lon);
    const illum = moonIllumination(date);
    const moonAlt = Math.max(-10, Math.min(90, moon.alt));
    return {
      light: L,
      moon: { alt: moon.alt, az: moon.az, illum },
      sunAlt: sunPosition(date, lat, lon).alt,
      x: {
        log_light_point: log10(L.light_point),
        log_light_10km: log10(L.light_10km),
        log_light_10_50km: log10(L.light_10_50km),
        log_light_50_160km: log10(L.light_50_160km),
        log_skyglow: log10(L.skyglow_index),
        elevation_km: elevationM / 1000,
        moon_illum: illum,
        moon_alt: moonAlt,
        moon_light: illum * Math.max(0, Math.sin(moonAlt * Math.PI / 180)),
        cloud,
        sun_alt: sunPosition(date, lat, lon).alt,
        solar_hour: solarHour(date, lon),
        ...geoSeason(date, lat)
      }
    };
  }

  static tree(t, x) {
    let n = 0;
    while (t.l[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n];
    return t.v[n];
  }

  predictVector(xDict) {
    const m = this.model;
    const x = m.features.map(f => xDict[f]);
    let sum = 0;
    for (const t of m.trees) sum += SkyModel.tree(t, x);
    if (m.type === 'hgb') return m.init + sum;
    if (m.type === 'gbr') return m.init + m.lr * sum;
    return sum / m.trees.length;
  }

  // Satellite-only baseline: sky brightness from the light right under the site
  satelliteOnly(xDict) {
    const s = this.model.satellite_only;
    return s.intercept + s.coef * xDict[s.feature];
  }

  // Full prediction for a site
  async predict(opts) {
    const inp = await this.buildInputs(opts);
    // Model is trained for real night; for a "sky quality" figure use darkness conditions
    const sqm = this.predictVector(inp.x) + (opts.applyLocal && this.localCalibration ? this.localCalibration.mean_delta : 0);
    return {
      sqm: clampSqm(sqm),
      satelliteOnly: clampSqm(this.satelliteOnly(inp.x)),
      uncertainty: this.model.residual_std,
      ...inp
    };
  }

  // What-if: scale all artificial light by `factor` (0..1) and re-predict
  predictWithLightFactor(inputs, factor) {
    const L = inputs.light;
    const x = {
      ...inputs.x,
      log_light_point: log10(L.light_point * factor),
      log_light_10km: log10(L.light_10km * factor),
      log_light_10_50km: log10(L.light_10_50km * factor),
      log_light_50_160km: log10(L.light_50_160km * factor),
      log_skyglow: log10(L.skyglow_index * factor)
    };
    return clampSqm(this.predictVector(x));
  }
}

const clampSqm = v => Math.max(16, Math.min(22.3, v));

// |latitude| and hemisphere-aware season — same as features.add_model_features()
export function geoSeason(date, lat) {
  return { abs_lat: Math.abs(lat), season: Math.sin(2 * Math.PI * (date.getUTCMonth() + 1) / 12) * Math.sign(lat) };
}

// Hours from local solar midnight, in [-12, 12) — same as features.solar_hour()
function solarHour(date, lon) {
  const h = ((date.valueOf() / 3600000 + lon / 15) % 24 + 24) % 24;
  return ((h + 12) % 24) - 12;
}
