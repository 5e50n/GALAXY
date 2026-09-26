// Export everything the website computes as data files (CSV/JSON) in reports/site_readings/.
// The numbers come from the site's own modules running in a real browser, so they are
// exactly what a visitor sees (same model, same NASA data, same astronomy).
//
//   npm run dev                      # site on http://localhost:5173/GALAXY/
//   node tools/export_site_readings.mjs [http://localhost:5173/GALAXY/]
//
// Needs Google Chrome (path below) and internet (NASA GIBS tiles, Open-Meteo).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const SITE = process.argv[2] || 'http://localhost:5173/GALAXY/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports', 'site_readings');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 1200000 });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(SITE, { waitUntil: 'networkidle2' });
const base = new URL(SITE).pathname;

const data = await page.evaluate(async base => {
  const imp = p => import(`${base}src/modules/${p}`);
  const [{ SkyModel }, { SkyModelV2 }, { lightFeatures }, { SITES }, nasa, sky, guide, planets, { DarkSkySimulator }] = await Promise.all([
    imp('skyModel.js'), imp('skyModelV2.js'), imp('viirs.js'), imp('sites.js'), imp('nasaApi.js'),
    imp('skyMath.js'), imp('telescopeGuide.js'), imp('planets.js'), imp('darkSkySimulator.js')]);
  const v1 = await new SkyModel().load(base);
  const v2 = await new SkyModelV2().load(base);
  const clamp = v => Math.max(16, Math.min(22.3, v));
  const REF = { moon_illum: 0, moon_alt: -10, moon_light: 0, cloud: 0, sun_alt: -40, solar_hour: 0 };
  const now = new Date();
  const dirsEn = guide.DIRECTIONS.en;

  // Same steps as predictPlace() in src/main.js
  async function predict(p) {
    const useV2 = v2.covers(p.lat, p.lon);
    const engine = useV2 ? v2 : v1;
    const lightV1 = await lightFeatures(p.lat, p.lon);
    const light = useV2 ? v2.radianceFeatures(p.lat, p.lon) : lightV1;
    const ref = await engine.buildInputs({ lat: p.lat, lon: p.lon, elevationM: p.alt, date: now, light });
    Object.assign(ref.x, REF);
    const refV1 = await v1.buildInputs({ lat: p.lat, lon: p.lon, elevationM: p.alt, date: now, light: lightV1 });
    Object.assign(refV1.x, REF);
    const aiSqm = clamp(engine.predictVector(ref.x));
    const when = guide.observingTime(p.lat, p.lon, now);
    const clouds = await nasa.fetchCloudCover(p.lat, p.lon, when);
    const tonightIn = await engine.buildInputs({ lat: p.lat, lon: p.lon, elevationM: p.alt, date: when,
      cloud: clouds == null ? 0 : Math.min(0.75, Math.round(clouds * 4) / 4), light });
    const tonightSqm = clamp(engine.predictVector(tonightIn.x));
    const domes = useV2 ? light.directions.map(d => d / 60) : light.directions;
    const plan = guide.planNight(p, tonightSqm, domes, when);
    const forecast = await nasa.fetchCloudForecast(p.lat, p.lon);
    const cloudQ = d => { const c = nasa.cloudAt(forecast, d); return c == null ? 0 : Math.min(0.75, Math.round(c * 4) / 4); };
    const inputsAt = d => engine.inputsFor({ lat: p.lat, lon: p.lon, elevationM: p.alt, date: d, cloud: cloudQ(d), light });
    const skyAt = d => clamp(engine.predictVector(inputsAt(d).x));
    return { engine, useV2, light, ref, aiSqm, inputsAt, skyAt, v1Sqm: clamp(v1.predictVector(refV1.x)), satSqm: clamp(engine.satelliteOnly(ref.x)),
      when, clouds, tonightSqm, plan };
  }

  const sites = [], targets = [], planetRows = [], simRows = [];
  const sim = new DarkSkySimulator();
  for (const [key, s] of Object.entries(SITES)) {
    const p = { key, ...s };
    const r = await predict(p);
    const nelm = sky.nelmFromSqm(r.aiSqm);
    sites.push({
      site_key: key, name_en: s.nameEn, name_ar: s.nameAr, lat: s.lat, lon: s.lon, elevation_m: s.alt,
      engine: r.useV2 ? 'v2 NASA Black Marble 2024' : 'v1 NASA GIBS 2016',
      ai_sqm: +r.aiSqm.toFixed(2), uncertainty_sqm: r.engine.model.residual_std,
      bortle: sky.bortleFromSqm(r.aiSqm), bortle_name: sky.BORTLE_NAMES.en[sky.bortleFromSqm(r.aiSqm)],
      nelm: +nelm.toFixed(2), naked_eye_stars: sky.visibleStars(nelm),
      satellite_only_sqm: +r.satSqm.toFixed(2), v1_sqm: +r.v1Sqm.toFixed(2),
      ...(r.useV2 ? { radiance_point: +r.light.rad_point.toFixed(2), radiance_10km: +r.light.rad_10km.toFixed(2),
        radiance_10_50km: +r.light.rad_10_50km.toFixed(2), radiance_50_160km: +r.light.rad_50_160km.toFixed(2),
        skyglow_index: +r.light.rad_skyglow.toFixed(1) } : {}),
      darkest_direction: dirsEn[r.plan.darkestSector], city_glow_direction: dirsEn[r.plan.brightestSector],
      tonight_time_utc: r.when.toISOString(), tonight_cloud_pct: r.clouds == null ? '' : Math.round(r.clouds * 100),
      tonight_moon_pct: Math.round(r.plan.moon.illum * 100), tonight_sqm: +r.tonightSqm.toFixed(2),
      tonight_visible_deep_sky: r.plan.visible.length
    });
    for (const o of r.plan.targets) targets.push({ site_key: key, object: o.id, name_en: o.en, name_ar: o.ar, type: o.type,
      altitude_deg: +o.alt.toFixed(1), direction: dirsEn[o.sector], effective_sqm: +o.effSqm.toFixed(2), needs_sqm: o.minSqm, visible: o.visible });
    for (const inst of planets.INSTRUMENTS) {
      for (const b of planets.planetsTonight(p, r.skyAt, inst.mm, now)) {
        // same as the site: real moon + forecast clouds at this body's observing time
        const fix = b.requiredSqm == null ? null : planets.requiredReduction(r.engine, r.inputsAt(b.time), b.requiredSqm);
        planetRows.push({ site_key: key, instrument: inst.key, body: b.key, goal: b.goal.en, up_tonight: b.up,
          best_time_utc: b.time.toISOString(), altitude_deg: +b.alt.toFixed(1), direction: dirsEn[guide.sectorOf(b.az)],
          magnitude: +b.mag.toFixed(2), sky_at_best_time: +b.sqm.toFixed(2), sees_body: b.visibleBody, sees_goal: b.visibleGoal,
          required_sqm: b.requiredSqm == null ? 'impossible' : +b.requiredSqm.toFixed(2),
          light_cut_needed_pct: b.requiredSqm == null ? '' : fix == null ? 'unreachable' : Math.ceil(fix.reduction * 100) });
      }
    }
    const impact = sim.calculateImpact(r.engine, r.ref);
    const need = t => { const f = planets.requiredReduction(r.engine, r.ref, t); return f == null ? 'unreachable' : Math.ceil(f.reduction * 100); };
    simRows.push({ site_key: key, now_sqm: +impact.baseMag.toFixed(2), default_policy_light_factor: +impact.lightFactor.toFixed(3),
      after_default_policy_sqm: +impact.simulatedMag.toFixed(2), gain_mag: +impact.totalGain.toFixed(2),
      extra_stars: impact.additionalStars, all_lights_off_sqm: +r.engine.predictWithLightFactor(r.ref, 0.001).toFixed(2),
      cut_for_bortle6_pct: need(18.0), cut_for_bortle5_pct: need(19.1), cut_for_bortle4_pct: need(20.4), cut_for_bortle3_pct: need(21.35) });
  }

  // Iraq grid (model v2), 0.25°, elevation from Open-Meteo in batches of 100
  const grid = [];
  for (let la = 29; la <= 38.001; la += 0.25) for (let lo = 39; lo <= 48.501; lo += 0.25) {
    const lat = +la.toFixed(2), lon = +lo.toFixed(2);
    if (v2.covers(lat, lon)) grid.push({ lat, lon });
  }
  // Open-Meteo allows ~600 locations per minute: 100 per request, one request every 12 s, retry on limit
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < grid.length; i += 100) {
    const chunk = grid.slice(i, i + 100);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const j = await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${chunk.map(g => g.lat).join(',')}&longitude=${chunk.map(g => g.lon).join(',')}`)).json();
        if (!j.elevation) throw new Error(j.reason || 'no elevation');
        chunk.forEach((g, k) => { g.elevation_m = j.elevation[k]; });
        break;
      } catch { chunk.forEach(g => { g.elevation_m = ''; }); await wait(65000); }
    }
    await wait(12000);
  }
  for (const g of grid) {
    const inp = await v2.buildInputs({ lat: g.lat, lon: g.lon, elevationM: g.elevation_m === '' ? 300 : g.elevation_m, date: now });
    Object.assign(inp.x, REF);
    g.ai_sqm = +clamp(v2.predictVector(inp.x)).toFixed(2);
    g.bortle = sky.bortleFromSqm(g.ai_sqm);
    g.nelm = +sky.nelmFromSqm(g.ai_sqm).toFixed(2);
    g.radiance_point = +inp.light.rad_point.toFixed(2);
  }

  return { generated_utc: now.toISOString(), sites, targets, planets: planetRows, simulator: simRows, grid,
    models: { v1: { metrics: v1.model.metrics, importances: v1.model.importances, residual_std: v1.model.residual_std },
      v2: { metrics: v2.model.metrics, importances: v2.model.importances, residual_std: v2.model.residual_std } } };
}, base);
await browser.close();

const csv = rows => {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return '\uFEFF' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';   // BOM: Excel shows Arabic
};
fs.mkdirSync(OUT, { recursive: true });
const files = {
  '01_sites_sky_quality.csv': csv(data.sites),
  '02_iraq_grid_sky_quality.csv': csv(data.grid),
  '03_tonight_telescope_targets.csv': csv(data.targets),
  '04_tonight_planets_by_instrument.csv': csv(data.planets),
  '05_lighting_scenarios.csv': csv(data.simulator),
  '06_model_metrics.json': JSON.stringify({ generated_utc: data.generated_utc, ...data.models }, null, 2)
};
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), c);
fs.writeFileSync(path.join(OUT, 'generated.json'), JSON.stringify({ generated_utc: data.generated_utc, source: SITE,
  rows: { sites: data.sites.length, grid: data.grid.length, targets: data.targets.length, planets: data.planets.length, scenarios: data.simulator.length } }, null, 2));
console.log('written to', OUT, { sites: data.sites.length, grid: data.grid.length, targets: data.targets.length, planets: data.planets.length });
