// ── Orbit Galaxy — Main App ──
// NASA VIIRS light + Moon/Sun → ORBIT AI (trained model, runs in the browser)
//   → sky quality · telescope guide · lighting what-if · community observations

import { SkyModel } from './modules/skyModel.js';
import { SkyModelV2 } from './modules/skyModelV2.js';
import { lightFeatures } from './modules/viirs.js';
import { DarkSkySimulator } from './modules/darkSkySimulator.js';
import { planNight, observingTime, DIRECTIONS, sectorOf, CATALOG } from './modules/telescopeGuide.js';
import { planetsTonight, requiredReduction, limitingMag, INSTRUMENTS, BODIES, planetEphemeris } from './modules/planets.js';
import { moonPosition, moonIllumination, raDecToAltAz, sunPosition, nextDarkness } from './modules/astro.js';
import { LiveCompass, declination, turn } from './modules/liveCompass.js';
import { buildHeatGrid, renderHeatImage, extremes, RAMP_CSS } from './modules/heatLayer.js';
import { SITES, DEFAULT_SITE } from './modules/sites.js';
import { GIBS_BLACK_MARBLE, GAS_FLARES, gasFlareAt, fetchElevation, fetchCloudForecast, cloudAt } from './modules/nasaApi.js';
import { nelmFromSqm, bortleFromSqm, visibleStars, BORTLE_NAMES } from './modules/skyMath.js';
import { setLang, getLang, t, onLangChange } from './modules/i18n.js';
import { SatelliteTracker } from './modules/satelliteTracker.js';

const BASE = import.meta.env.BASE_URL;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const model = new SkyModel();        // v1: NASA GIBS 2016, works everywhere
let modelV2 = null;                  // v2: NASA Black Marble 2024, Iraq (loaded if available)
const sim = new DarkSkySimulator();
let map = null;
let nasaLayer = null;
let customMarker = null;
const siteMarkers = {};
let current = null;        // { key, lat, lon, alt, nameEn, nameAr }
let result = null;         // last prediction bundle
let requestId = 0;
let observations = [];
let photoPlaces = {};          // illustrative gallery locations (ml/07_display_places.py)
const photoMarkers = [];
const lc = { compass: null, live: false, heading: null, target: 'darkest', targets: [], lastSaid: '', lastSaidAt: 0, timer: null };
const pl = { inst: 'scope114', key: null, cut: 0, viewer: null, glFailed: false };
const REFRESH_MS = 10 * 60000;          // live data refresh
const heat = { grid: null, elev: null, overlay: null, building: null, local: null, localId: 0 };
const HEAT_DETAIL_ZOOM = 8;          // from here the model is re-run on the visible area, finer

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  setLang(getLang());
  syncLangButton();
  bindTopbar();
  bindTabs();
  bindSimulator();
  bindPlanets();
  bindCompass();
  bindLocate();
  markSoonLinks();
  buildSiteSelect();
  setStatus('loading', 'loadingModel');

  try {
    await model.load(BASE);
    try { modelV2 = await new SkyModelV2().load(BASE); } catch { modelV2 = null; }   // optional
  } catch (e) {
    console.error('Model failed to load', e);
    setStatus('error', 'errModel');
    return;
  }
  renderModelSection();
  renderHero();
  initMap();
  bindHeat();
  $('photo-toggle').addEventListener('change', e => photoMarkers.forEach(m => (e.target.checked ? m.addTo(map) : map.removeLayer(m))));
  loadObservations();
  $('obs-gallery').addEventListener('click', e => {
    const b = e.target.closest('.o-check');
    const o = b && observations.find(x => x.thumb === b.dataset.thumb);
    if (o) checkPhotoPlace(o);
  });
  await selectSite(DEFAULT_SITE);
  const refresh = () => { if (current && !document.hidden) predictPlace(current); };
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && result && Date.now() - result.updatedAt > REFRESH_MS) refresh();
  });
});

// ── Helpers ──
const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const placeName = p => (getLang() === 'ar' ? p.nameAr : p.nameEn);
const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(d));
const clamp = v => Math.max(16, Math.min(22.3, v));
const inIraq = (lat, lon) => lat > 29 && lat < 37.5 && lon > 38.5 && lon < 48.8;
// Western digits in both languages so all numbers on the page look the same
const locale = () => (getLang() === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB');
// keep coordinates left-to-right inside Arabic text
const ltr = s => `⁦${s}⁩`;

function setStatus(state, key) {
  document.querySelector('.results')?.setAttribute('aria-busy', String(state === 'loading'));
  $('status').className = 'status ' + (state === 'ready' ? 'ready' : state === 'error' ? 'error' : '');
  const txt = $('status-text');
  txt.setAttribute('data-i18n', key);
  txt.textContent = t(key);
}

// ── Top bar: language + theme ──
function syncLangButton() {
  $('btn-lang').textContent = getLang() === 'ar' ? 'English' : 'عربي';
}

function bindTopbar() {
  $('btn-lang').addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    syncLangButton();
  });
  onLangChange(() => {
    buildSiteSelect();
    renderModelSection();
    if (result) renderAll();
    renderObservations();
    syncThemeButton();
    if (lc.live) $('lc-start').textContent = t('lcStop');
    renderHeroText();
    markSoonLinks();
    updateHeatInfo();
  });

  $('btn-theme').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('orbit-theme', light ? 'light' : 'dark'); } catch { /* private mode */ }
    syncThemeButton();
  });
  syncThemeButton();
}

function syncThemeButton() {
  const light = document.documentElement.dataset.theme === 'light';
  const b = $('btn-theme');
  b.textContent = light ? '🌙' : '☀️';
  b.setAttribute('data-i18n-aria', light ? 'themeDark' : 'themeLight');
  b.setAttribute('aria-label', t(light ? 'themeDark' : 'themeLight'));
}

// ── Tabs ──
function bindTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const select = tab => {
    tabs.forEach(tb => {
      const on = tb === tab;
      tb.setAttribute('aria-selected', String(on));
      tb.tabIndex = on ? 0 : -1;
      $(tb.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 'tab-sim' && result) updateSimulator(true);   // canvases need a visible size
    if (tab.id === 'tab-planets') renderPlanets(); else pl.viewer?.stop();
  };
  tabs.forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const forward = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const next = tabs[(i + (forward ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
}

// ── Site selector ──
function buildSiteSelect() {
  const sel = $('site-select');
  sel.innerHTML = '';
  if (current?.key === 'custom') {
    const og = document.createElement('optgroup');
    og.label = t('optCustom');
    const o = document.createElement('option');
    o.value = 'custom';
    o.textContent = `📍 ${placeName(current)}`;
    og.appendChild(o);
    sel.appendChild(og);
  }
  for (const [group, label] of [['nineveh', 'optNineveh'], ['iraq', 'optIraq']]) {
    const og = document.createElement('optgroup');
    og.label = t(label);
    for (const [key, s] of Object.entries(SITES).filter(([, s]) => s.group === group)) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = `${s.icon} ${placeName(s)}`;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.value = current?.key || DEFAULT_SITE;
  sel.onchange = () => { if (SITES[sel.value]) selectSite(sel.value, true); };
}

function selectSite(key, fly = false) {
  const s = SITES[key];
  if (fly && map) map.flyTo([s.lat, s.lon], 10, { duration: 0.8, animate: !REDUCED_MOTION });
  return predictPlace({ key, ...s });
}

// ── Geolocation ──
function bindLocate() {
  const locate = () => {
    $('app').scrollIntoView();
    if (!navigator.geolocation) { showAlert(t('errLocation')); return; }
    setStatus('loading', 'loadingSky');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const alt = pos.coords.altitude ?? await fetchElevation(lat, lon);
        if (map) map.flyTo([lat, lon], 10, { duration: 0.8, animate: !REDUCED_MOTION });
        predictPlace({ key: 'custom', lat, lon, alt, nameEn: 'My location', nameAr: 'موقعي' });
      },
      () => { setStatus('ready', 'ready'); showAlert(t('errLocation')); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  };
  $('cta-locate').addEventListener('click', locate);
  $('btn-locate').addEventListener('click', locate);
}

function showAlert(msg) {
  const a = $('alert');
  a.textContent = msg || '';
  a.hidden = !msg;
}

// ── The core: predict everything for one place ──
async function predictPlace(place) {
  const id = ++requestId;
  current = place;
  buildSiteSelect();
  highlightMarker(place);
  setStatus('loading', 'loadingSky');
  showAlert('');

  // Inside Iraq use v2 (2024 calibrated radiance); elsewhere v1 (2016 GIBS, global)
  const engine = modelV2?.covers(place.lat, place.lon) ? modelV2 : model;
  const light = engine === modelV2 ? modelV2.radianceFeatures(place.lat, place.lon) : await lightFeatures(place.lat, place.lon);
  if (id !== requestId) return null;
  // guide compass expects the v1 light-index scale; ~60 nW/cm²/sr ≈ saturated v1 pixel
  const domes = engine === modelV2 ? light.directions.map(d => d / 60) : light.directions;
  const local = inIraq(place.lat, place.lon) && model.localCalibration ? model.localCalibration.mean_delta : 0;
  const forecast = await fetchCloudForecast(place.lat, place.lon);
  if (id !== requestId) return null;

  // Model inputs for any moment: real Sun, Moon and forecast clouds at that hour
  const cloudQ = d => { const c = cloudAt(forecast, d); return c == null ? 0 : Math.min(0.75, Math.round(c * 4) / 4); };
  const inputsAt = (d, extra = {}) => {
    const inp = engine.inputsFor({ lat: place.lat, lon: place.lon, elevationM: place.alt, date: d, cloud: cloudQ(d), light });
    Object.assign(inp.x, extra);
    return inp;
  };
  const skyAt = d => clamp(engine.predictVector(inputsAt(d).x) + local);

  // 1) Site sky quality: reference conditions = clear, moonless, local midnight (a property of the place)
  const now = new Date();
  const refInputs = inputsAt(now, { moon_illum: 0, moon_alt: -10, moon_light: 0, cloud: 0, sun_alt: -40, solar_hour: 0 });
  const aiSqm = clamp(engine.predictVector(refInputs.x) + local);
  const satSqm = clamp(engine.satelliteOnly(refInputs.x));

  // 2) Right now: the model is valid only once the Sun is below −12° (as in training)
  const sunNow = sunPosition(now, place.lat, place.lon).alt;
  const nowState = sunNow > -0.83 ? 'day' : sunNow > -12 ? 'twilight' : 'night';
  const nowSqm = nowState === 'night' ? skyAt(now) : null;

  // 3) Tonight: real moon + cloud forecast at observing time
  const when = observingTime(place.lat, place.lon, now);
  const clouds = cloudAt(forecast, when);
  const tonightSqm = skyAt(when);
  const plan = planNight(place, tonightSqm, domes, when);

  result = {
    engine, place, light, refInputs, aiSqm, satSqm, when, clouds, tonightSqm, plan,
    forecast, inputsAt, skyAt, now, sunNow, nowState, nowSqm, updatedAt: now,
    flare: gasFlareAt(place.lat, place.lon)
  };
  renderAll();
  updateHeatInfo();
  setStatus('ready', 'ready');
  return result;
}

function renderAll() {
  const p = result.place;
  setText('place-name', `${p.key === 'custom' ? '📍 ' : ''}${placeName(p)} · ${ltr(`${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}° · ${Math.round(p.alt)} m`)}`);
  showAlert(result.flare ? t('flareWarn') : '');
  renderSky();
  renderGuide();
  updateSimulator(true);
  renderPlanets();
}

// ── Heat map: model prediction on a grid over Iraq ──
function bindHeat() {
  $('heat-bar').style.background = RAMP_CSS;
  $('heat-toggle').addEventListener('change', e => (e.target.checked ? showHeat() : hideHeat()));
  $('heat-worst').addEventListener('click', () => {
    const w = heat.ext?.brightest;
    if (w) goToCell(w, t('heatWorstName'));
  });
  $('heat-dark').addEventListener('click', () => {
    const d = heat.ext?.darkestNear;
    if (d) goToCell(d, t('heatDarkName'));
  });
}

async function showHeat() {
  $('heat-legend').hidden = false;
  if (!modelV2) { setText('heat-status', t('heatNoModel')); return; }
  if (!heat.grid) {
    if (!heat.building) {
      heat.building = (async () => {
        heat.elev = await (await fetch(`${BASE}data/iraq_elevation.json`)).json();
        heat.grid = await buildHeatGrid(modelV2, heat.elev, p => setText('heat-status', t('heatBuilding').replace('{p}', Math.round(p * 100))));
        const img = renderHeatImage(heat.grid);
        heat.overlay = L.imageOverlay(img.url, img.bounds, { opacity: 1, className: 'heat-img', interactive: false });
      })();
    }
    await heat.building;
  }
  if (!$('heat-toggle').checked) return;           // switched off while building
  // one light layer at a time: the NASA picture and the model heat map would mix
  heat.nasaWasOn = $('nasa-toggle').checked;
  if (heat.nasaWasOn) { $('nasa-toggle').checked = false; map.removeLayer(nasaLayer); }
  $('map').classList.add('heat-on');
  if (!heat.moveBound) { map.on('moveend', updateHeatDetail); heat.moveBound = true; }
  if (map.getZoom() >= HEAT_DETAIL_ZOOM) updateHeatDetail();
  else { heat.overlay.addTo(map); map.flyToBounds(heat.overlay.getBounds(), { padding: [10, 10], duration: 0.8, animate: !REDUCED_MOTION }); }
  updateHeatInfo();
}

// Zoomed in: recompute the visible area with a finer grid (≈1–3 km) so the city stays readable
async function updateHeatDetail() {
  if (!$('heat-toggle').checked || !heat.grid) return;
  const id = ++heat.localId;
  if (map.getZoom() < HEAT_DETAIL_ZOOM) {
    if (heat.local) { map.removeLayer(heat.local); heat.local = null; }
    if (!map.hasLayer(heat.overlay)) heat.overlay.addTo(map);
    setText('heat-status', t('heatNote'));
    return;
  }
  const bnd = map.getBounds().pad(0.15);
  const w = bnd.getEast() - bnd.getWest();
  const step = Math.min(0.05, Math.max(0.01, w / 110));
  const area = {
    lat0: Math.max(29, Math.floor(bnd.getSouth() / step) * step), lat1: Math.min(38, bnd.getNorth()),
    lon0: Math.max(39, Math.floor(bnd.getWest() / step) * step), lon1: Math.min(48.6, bnd.getEast()), step
  };
  if (area.lat1 <= area.lat0 || area.lon1 <= area.lon0) return;
  setText('heat-status', t('heatDetail').replace('{km}', Math.round(step * 111)));
  const grid = await buildHeatGrid(modelV2, heat.elev, () => {}, area, () => id !== heat.localId);
  if (!grid || id !== heat.localId || !$('heat-toggle').checked) return;
  const img = renderHeatImage(grid, 8, { glowPass: false, alphaK: 0.85 });
  const layer = L.imageOverlay(img.url, img.bounds, { opacity: 1, className: 'heat-img', interactive: false });
  layer.addTo(map);
  if (heat.local) map.removeLayer(heat.local);
  heat.local = layer;
  if (map.hasLayer(heat.overlay)) map.removeLayer(heat.overlay);
}

function hideHeat() {
  $('heat-legend').hidden = true;
  if (heat.overlay) map.removeLayer(heat.overlay);
  if (heat.local) { map.removeLayer(heat.local); heat.local = null; }
  heat.localId++;
  $('map').classList.remove('heat-on');
  if (heat.nasaWasOn) { $('nasa-toggle').checked = true; nasaLayer.addTo(map); heat.nasaWasOn = false; }
}

function updateHeatInfo() {
  if (!heat.grid || $('heat-legend').hidden) return;
  heat.ext = extremes(heat.grid, current || SITES[DEFAULT_SITE]);
  setText('heat-status', t('heatNote'));
  $('heat-worst').disabled = !heat.ext.brightest;
  const d = heat.ext.darkestNear;
  $('heat-dark').disabled = !d;
  const here = d && d.km < 6;
  $('heat-dark').disabled = !d || here;
  $('heat-dark').textContent = here ? t('heatHereDark') : d ? t('heatDarkNear').replace('{km}', Math.round(d.km)) : t('heatDarkName');
}

function goToCell(cell, name) {
  const E = heat.elev;
  const r = Math.min(E.ny - 1, Math.max(0, Math.round((cell.lat - E.lat0) / E.step)));
  const c = Math.min(E.nx - 1, Math.max(0, Math.round((cell.lon - E.lon0) / E.step)));
  const label = name;
  map.flyTo([cell.lat, cell.lon], 10, { duration: 0.8, animate: !REDUCED_MOTION });
  predictPlace({ key: 'custom', lat: cell.lat, lon: cell.lon, alt: E.elev[r * E.nx + c] ?? 300, nameEn: label, nameAr: label });
}

// ── Hero: the same model, city vs dark site (clear, moonless night) ──
const hero = {};
async function renderHero() {
  const engine = modelV2 || model;
  for (const [key, id] of [['mosulCenter', 'city'], ['sinjar', 'dark']]) {
    const s = SITES[key];
    const light = engine === modelV2 && modelV2.covers(s.lat, s.lon) ? modelV2.radianceFeatures(s.lat, s.lon) : await lightFeatures(s.lat, s.lon);
    const eng = engine === modelV2 && modelV2.covers(s.lat, s.lon) ? modelV2 : model;
    const inp = await eng.buildInputs({ lat: s.lat, lon: s.lon, elevationM: s.alt, date: new Date(), light });
    Object.assign(inp.x, { moon_illum: 0, moon_alt: -10, moon_light: 0, cloud: 0, sun_alt: -40, solar_hour: 0 });
    const sqm = clamp(eng.predictVector(inp.x));
    hero[id] = { sqm, stars: visibleStars(nelmFromSqm(sqm)) };
    renderSkyCanvas('hero-' + id, sqm, hero[id].stars);
  }
  renderHeroText();
}
function renderHeroText() {
  for (const id of ['city', 'dark']) {
    if (hero[id]) setText(`hero-${id}-v`, `${t('heroStars').replace('{n}', hero[id].stars.toLocaleString(locale()))} · B${bortleFromSqm(hero[id].sqm)}`);
  }
}

// Community links not set yet (href="#") → show "soon" instead of opening a blank tab
function markSoonLinks() {
  for (const id of ['link-insta', 'link-send']) {
    const a = $(id);
    if (a.getAttribute('href') !== '#') continue;
    a.setAttribute('aria-disabled', 'true');
    a.removeAttribute('target');
    if (!a.querySelector('.soon')) a.insertAdjacentHTML('beforeend', ` <span class="soon">${t('soon')}</span>`);
    else a.querySelector('.soon').textContent = t('soon');
    a.onclick = e => e.preventDefault();
  }
}

// ── Tab 1: sky quality ──
const moonText = (d, lat, lon) => {
  const up = moonPosition(d, lat, lon).alt > 0;
  return up ? ltr(`${Math.round(moonIllumination(d) * 100)}%`) : t('moonBelowShort');
};
const cloudText = c => (c == null ? t('unknown') : ltr(`${Math.round(c * 100)}%`));
const clock = d => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

function renderNow() {
  const { place, now, nowState, nowSqm, when, tonightSqm, clouds, forecast } = result;
  const dark = nextDarkness(now, place.lat, place.lon);
  $('now-card').classList.toggle('is-day', nowState === 'day');
  if (nowState === 'night') {
    setText('now-v', `${ltr(nowSqm.toFixed(2))} · B${bortleFromSqm(nowSqm)}`);
    setText('now-s', t('nowNightSub').replace('{moon}', moonText(now, place.lat, place.lon)).replace('{cloud}', cloudText(cloudAt(forecast, now))));
  } else {
    setText('now-v', t(nowState === 'day' ? 'nowDay' : 'nowTwilight'));
    setText('now-s', t(nowState === 'day' ? 'nowDaySub' : 'nowTwilightSub').replace('{time}', dark ? clock(dark) : '—'));
  }
  setText('tonight-l', t('tonightLabel').replace('{time}', clock(when)));
  setText('tonight-v', `${ltr(tonightSqm.toFixed(2))} · B${bortleFromSqm(tonightSqm)}`);
  setText('tonight-s', t('tonightSub').replace('{moon}', moonText(when, place.lat, place.lon)).replace('{cloud}', cloudText(clouds)));
  setText('v-updated', t('updated').replace('{time}', clock(result.updatedAt)));
}

function renderSky() {
  const { aiSqm, satSqm } = result;
  renderNow();
  const b = bortleFromSqm(aiSqm);
  const nelm = nelmFromSqm(aiSqm);
  setText('v-ai', fmt(aiSqm));
  setText('v-bortle-badge', `${t('bortle')} ${b} · ${BORTLE_NAMES[getLang()][b]}`);
  $('verdict').style.setProperty('--bc', `var(--b${b})`);
  $('v-scale-marker').style.insetInlineStart = `${((b - 0.5) / 9) * 100}%`;
  $('v-scale').setAttribute('aria-label', t('scaleLabel').replace('{b}', b));
  setText('v-unc', fmt(result.engine.model.residual_std, 1));
  setText('v-engine', t(result.engine === modelV2 ? 'engineV2' : 'engineV1'));
  setText('v-plain', t('b' + b));
  setText('v-nelm', fmt(nelm, 1));
  setText('v-stars', visibleStars(nelm).toLocaleString(locale()));
  setText('v-sat', fmt(satSqm));
  const d = aiSqm - satSqm;
  setText('v-delta', ltr(`${d >= 0 ? '+' : ''}${d.toFixed(2)}`));
}

// ── Tab 2: telescope guide ──
function renderGuide() {
  const { plan, when, clouds, tonightSqm } = result;
  const lang = getLang();
  const dirs = DIRECTIONS[lang];
  const moonDir = dirs[Math.round(plan.moon.az / 45) % 8];
  setText('g-when', when.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
  setText('g-moon', `${Math.round(plan.moon.illum * 100)}% · ${plan.moon.up ? moonDir : t('moonBelow')}`);
  setText('g-clouds', clouds == null ? t('unknown') : `${Math.round(clouds * 100)}%`);
  setText('g-sky', `${fmt(tonightSqm)} · B${bortleFromSqm(tonightSqm)}`);
  setText('g-darkest', dirs[plan.darkestSector]);
  setText('g-glow', dirs[plan.brightestSector]);

  const typeKey = { nebula: 'typeNebula', cluster: 'typeCluster', galaxy: 'typeGalaxy', double: 'typeDouble', milkyway: 'typeMilkyway' };
  const list = [...plan.visible.slice(0, 5), ...plan.targets.filter(x => !x.visible).slice(0, 2)];
  $('g-targets').innerHTML =
    (plan.visible.length === 0 ? `<p class="empty">${t('gNone')}</p>` : '') +
    list.map(o => `
      <div class="target ${o.visible ? '' : 'dim'}">
        <div><span class="t-name">${lang === 'ar' ? o.ar : o.en}</span> <span class="t-type">${t(typeKey[o.type])} · ${o.id}</span></div>
        <div class="t-pos">${dirs[o.sector]} · ${t('gAlt')} ${ltr(Math.round(o.alt) + '°')}${o.visible ? '' : ` · ${t('gHidden')}`}</div>
      </div>`).join('');
  drawCompass(plan);
  updateCompassTargets();
}

function drawCompass(plan) {
  const dirs = DIRECTIONS[getLang()];
  const R = 100;
  const polar = (az, r) => [r * Math.sin(az * Math.PI / 180), -r * Math.cos(az * Math.PI / 180)];
  let html = '<circle r="100" fill="var(--surface-2)" stroke="var(--border)"/>';
  plan.domeLevel.forEach((v, i) => {
    const [x1, y1] = polar(i * 45 - 22.5, R), [x2, y2] = polar(i * 45 + 22.5, R);
    const fill = i === plan.darkestSector ? 'rgba(134,207,163,0.45)' : `rgba(233,192,122,${(0.08 + 0.6 * v).toFixed(2)})`;
    html += `<path d="M0 0 L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z" fill="${fill}" stroke="var(--border)"/>`;
  });
  html += [30, 60].map(a => `<circle r="${R * (90 - a) / 90}" fill="none" stroke="var(--border)" stroke-dasharray="3 3"/>`).join('');
  dirs.forEach((d, i) => {
    if (i % 2) return;
    const [x, y] = polar(i * 45, R + 14);
    html += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="c-label">${d}</text>`;
  });
  plan.visible.slice(0, 5).forEach(o => {
    const [x, y] = polar(o.az, R * (90 - o.alt) / 90);
    html += `<circle cx="${x}" cy="${y}" r="4" fill="var(--accent)"/><text x="${x + 6}" y="${y - 6}" class="c-obj">${o.id}</text>`;
  });
  if (plan.moon.up) {
    const [x, y] = polar(plan.moon.az, R * (90 - plan.moon.alt) / 90);
    html += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="16">🌙</text>`;
  }
  const svg = $('compass');
  svg.innerHTML = html;
  svg.setAttribute('aria-label', t('compassLabel').replace('{dark}', dirs[plan.darkestSector]).replace('{glow}', dirs[plan.brightestSector]));
}

// ── Live compass (phone orientation sensor) ──
function bindCompass() {
  lc.compass = new LiveCompass(h => { lc.heading = h; drawLiveCompass(); });
  $('lc-select').addEventListener('change', e => { lc.target = e.target.value; lc.lastSaid = ''; drawLiveCompass(); });
  $('lc-start').addEventListener('click', async () => {
    if (lc.live) { stopCompass(); return; }
    setText('lc-status', '…');
    const decl = current ? declination(current.lat) : 0;
    const res = await lc.compass.start(decl);
    if (res === 'ok') {
      lc.live = true;
      setText('lc-status', t('lcLive').replace('{decl}', decl.toFixed(1)));
      $('lc-start').textContent = t('lcStop');
      lc.timer = setInterval(updateCompassTargets, 60000);    // sky objects move ~0.25°/min
    } else {
      setText('lc-status', t({ denied: 'lcDenied', unsupported: 'lcUnsupported', nosensor: 'lcNoSensor' }[res]));
    }
    drawLiveCompass();
  });
  drawLiveCompass();
}

function stopCompass() {
  lc.compass.stop();
  lc.live = false;
  lc.heading = null;
  clearInterval(lc.timer);
  $('lc-start').textContent = t('lcStart');
  setText('lc-status', '');
  drawLiveCompass();
}

// Everything worth pointing at, positioned for right now
function updateCompassTargets() {
  if (!result) return;
  const { lat, lon } = result.place;
  const lang = getLang();
  const now = new Date();
  const list = [
    { id: 'darkest', label: t('lcDarkest'), az: result.plan.darkestSector * 45, alt: null },
    { id: 'glow', label: t('lcGlow'), az: result.plan.brightestSector * 45, alt: null }
  ];
  const moon = moonPosition(now, lat, lon);
  list.push({ id: 'moon', label: t('lcMoon'), az: moon.az, alt: moon.alt });
  for (const b of BODIES) {
    if (b.key === 'moon') continue;
    const e = planetEphemeris(b.key, now);
    const p = raDecToAltAz(e.ra, e.dec, now, lat, lon);
    if (p.alt > 0) list.push({ id: b.key, label: `🪐 ${b[lang]}`, az: p.az, alt: p.alt });
  }
  for (const o of CATALOG) {
    const p = raDecToAltAz(o.ra, o.dec, now, lat, lon);
    if (p.alt > 15) list.push({ id: o.id, label: `✨ ${lang === 'ar' ? o.ar : o.en} (${o.id})`, az: p.az, alt: p.alt });
  }
  lc.targets = list;
  if (!list.some(x => x.id === lc.target)) lc.target = 'darkest';
  $('lc-select').innerHTML = list.map(x => `<option value="${x.id}"${x.id === lc.target ? ' selected' : ''}>${x.label}</option>`).join('');
  drawLiveCompass();
}

function drawLiveCompass() {
  const svg = $('lc-dial');
  if (!svg) return;
  const dirs = DIRECTIONS[getLang()];
  const heading = lc.heading ?? 0;                    // no sensor: north up
  const tg = lc.targets.find(x => x.id === lc.target);
  const R = 100;
  const pt = (az, r) => [r * Math.sin(az * Math.PI / 180), -r * Math.cos(az * Math.PI / 180)];
  let rose = `<circle r="${R}" fill="var(--surface-2)" stroke="var(--control)"/>`;
  for (let a = 0; a < 360; a += 15) {
    const [x1, y1] = pt(a, R), [x2, y2] = pt(a, a % 45 ? R - 6 : R - 12);
    rose += `<line class="lc-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${a % 45 ? 1 : 2}"/>`;
  }
  dirs.forEach((d, i) => {
    const [x, y] = pt(i * 45, R - 26);
    rose += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="lc-lbl${i === 0 ? ' lc-n' : ''}" transform="rotate(${heading} ${x} ${y})">${i % 2 ? '' : d}</text>`;
  });
  if (tg) {
    const [x, y] = pt(tg.az, R - 6);
    rose += `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="var(--good)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${x}" cy="${y}" r="8" fill="var(--good)"/>`;
  }
  svg.innerHTML = `<g transform="rotate(${-heading})">${rose}</g>
    <path d="M0 -118 L-9 -100 L9 -100 Z" fill="var(--accent)"/><circle r="5" fill="var(--text)"/>`;

  setText('lc-heading', lc.heading == null ? '—' : `${dirs[sectorOf(lc.heading)]} · ${ltr(Math.round(lc.heading) + '°')}`);
  if (!tg) { setText('lc-instr', '—'); return; }
  let instr;
  if (lc.heading == null) {
    instr = t('lcNoSensorDir').replaceAll('{dir}', dirs[sectorOf(tg.az)]).replace('{az}', Math.round(tg.az));
  } else {
    const d = turn(lc.heading, tg.az);
    instr = Math.abs(d) < 8 ? t('lcOnTarget') : t(d > 0 ? 'lcRight' : 'lcLeft').replace('{deg}', Math.round(Math.abs(d)));
  }
  setText('lc-alt', tg.alt == null ? t('lcAltHorizon') : tg.alt < 0 ? t('lcBelow') : t('lcAlt').replace('{alt}', Math.round(tg.alt)));
  setText('lc-instr', instr);
  // screen readers: announce only when the advice changes, at most every 2 s
  const now = Date.now();
  if (instr !== lc.lastSaid && now - lc.lastSaidAt > 2000) {
    setText('lc-sr', instr);
    lc.lastSaid = instr;
    lc.lastSaidAt = now;
  }
}

// ── Tab 3: lighting simulator (runs through the AI model) ──
function bindSimulator() {
  [['ds-useful', 'useful'], ['ds-targeted', 'targeted'], ['ds-dimming', 'dimming']].forEach(([id, key]) => {
    const input = $(id);
    input.addEventListener('input', () => {
      setText(id + '-v', input.value + '%');
      sim.setParam(key, parseInt(input.value, 10));
      updateSimulator();
    });
  });
  $('ds-curfew').addEventListener('change', e => { sim.setParam('curfew', e.target.checked); updateSimulator(); });
  $('ds-warm').addEventListener('change', e => { sim.setParam('warmColor', e.target.checked); updateSimulator(); });
}

function updateSimulator(redrawBefore = false) {
  if (!result) return;
  const r = sim.calculateImpact(result.engine, result.refInputs);
  setText('ds-gain', (r.totalGain >= 0 ? '+' : '') + r.totalGain.toFixed(2));
  setText('ds-stars', '+' + r.additionalStars.toLocaleString(locale()));
  setText('ds-energy', r.energyReductionPct + '%');
  setText('ds-factor', r.lightFactor.toFixed(2));
  setText('sky-before-mag', `${r.baseMag.toFixed(2)} · B${bortleFromSqm(r.baseMag)}`);
  setText('sky-after-mag', `${r.simulatedMag.toFixed(2)} · B${bortleFromSqm(r.simulatedMag)}`);
  if ($('panel-sim').hidden) return;
  if (redrawBefore) renderSkyCanvas('sky-before-canvas', r.baseMag, r.starsBefore);
  renderSkyCanvas('sky-after-canvas', r.simulatedMag, r.starsAfter);
}

// ── Tab 4: planets — solar-system forecast + calibration through the AI model ──
function bindPlanets() {
  const sel = $('pl-instrument');
  sel.addEventListener('change', () => { pl.inst = sel.value; pl.cut = 0; renderPlanets(); });
  $('pl-list').addEventListener('click', e => {
    const b = e.target.closest('[data-body]');
    if (b) { pl.key = b.dataset.body; pl.cut = 0; renderPlanets(); }
  });
  $('pl-cut-range').addEventListener('input', e => { pl.cut = +e.target.value; updateCalibration(); });
  $('pl-auto').addEventListener('click', () => {
    if (pl.autoCut == null) return;
    pl.cut = pl.autoCut;
    $('pl-cut-range').value = pl.cut;
    updateCalibration();
  });
}

const fill = (key, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));

async function renderPlanets() {
  if (!result) return;
  const lang = getLang();
  const dirs = DIRECTIONS[lang];
  const inst = INSTRUMENTS.find(i => i.key === pl.inst);
  $('pl-instrument').innerHTML = INSTRUMENTS.map(i => `<option value="${i.key}"${i.key === pl.inst ? ' selected' : ''}>${i[lang]}</option>`).join('');

  // each body is judged under the REAL sky at its own best time (moon + clouds of that hour)
  const bodies = planetsTonight(result.place, result.skyAt, inst.mm, new Date());
  if (!pl.key || !bodies.some(b => b.key === pl.key)) {
    pl.key = (bodies.find(b => b.key === 'saturn' && b.up) || bodies.find(b => b.key === 'jupiter' && b.up) || bodies.find(b => b.up && b.key !== 'moon') || bodies[0]).key;
  }
  $('pl-list').innerHTML = bodies.map(b => {
    const state = !b.up ? t('plBelow') : b.visibleGoal ? fill('plStateGoal', { goal: b.goal[lang] })
      : b.visibleBody ? fill('plStateBody', { goal: b.goal[lang] }) : t('plStateNo');
    const icon = !b.up ? '⬇️' : b.visibleGoal ? '✅' : b.visibleBody ? '🟡' : '⛔';
    return `<button type="button" class="pl-item${b.up ? '' : ' dim'}" data-body="${b.key}" aria-pressed="${b.key === pl.key}">
      <span><span class="pl-name">${icon} ${b[lang]}</span> <span class="pl-state">${state}</span></span>
      <span class="pl-pos">${b.up ? `${dirs[sectorOf(b.az)]} · ${ltr(Math.round(b.alt) + '°')} · ${clock(b.time)}` : ''}</span></button>`;
  }).join('');

  const b = bodies.find(x => x.key === pl.key);
  const name = b[lang], goal = b.goal[lang], instName = inst[lang];
  const { place } = result;
  // model inputs at the observing time of this body
  pl.b = b; pl.inst_ = inst;
  pl.inputs = result.inputsAt(b.time);
  pl.moon = moonText(b.time, place.lat, place.lon);
  pl.cloud = cloudText(cloudAt(result.forecast, b.time));
  setText('pl-title', fill('plTitle', { goal, name }));
  setText('pl-best', b.up ? `${clock(b.time)} · ${dirs[sectorOf(b.az)]} · ${ltr(Math.round(b.alt) + '°')}` : t('plBelow'));
  setText('pl-mag', ltr(b.mag.toFixed(1)));
  setText('pl-slider-sub', fill('plSliderSub', { time: clock(b.time), moon: pl.moon, cloud: pl.cloud }));

  let fix = null, verdict;
  pl.autoCut = null;
  if (b.requiredSqm == null) {
    setText('pl-need', t('plImpossible'));
    setText('pl-cut', '—');
    verdict = fill('plVerdictScope', { name, inst: instName });
  } else {
    fix = requiredReduction(result.engine, pl.inputs, b.requiredSqm);
    const need = b.requiredSqm < 16 ? t('plAnySky') : `${b.requiredSqm.toFixed(2)} · B${bortleFromSqm(b.requiredSqm)}`;
    setText('pl-need', need);
    setText('pl-cut', !fix ? t('plTooBright') : fix.reduction === 0 ? t('plNoCut') : `${Math.ceil(fix.reduction * 100)}%`);
    if (fix) pl.autoCut = Math.ceil(fix.reduction * 100);
    // if even all lights off is not enough, is it the Moon?
    const moonBlocks = !fix && requiredReduction(result.engine, result.inputsAt(b.time, { moon_illum: 0, moon_alt: -10, moon_light: 0 }), b.requiredSqm);
    verdict = !b.up ? fill('plVerdictBelow', { name })
      : fix && fix.reduction === 0 ? fill('plVerdictGoal', { goal, name, inst: instName, time: clock(b.time), dir: dirs[sectorOf(b.az)] })
      : fix ? fill('plVerdictCut', { goal, name, inst: instName, time: clock(b.time), need: b.requiredSqm.toFixed(2), cut: Math.ceil(fix.reduction * 100) })
      : moonBlocks ? fill('plVerdictMoon', { name, moon: pl.moon, need: b.requiredSqm.toFixed(2) })
      : fill('plVerdictFar', { goal, name, inst: instName });
  }
  setText('pl-verdict', verdict);
  const auto = $('pl-auto');
  auto.textContent = pl.autoCut == null ? t('plAutoNo') : pl.autoCut === 0 ? t('plAutoNone') : fill('plAuto', { cut: pl.autoCut });
  auto.disabled = !b.up || pl.autoCut == null || pl.autoCut === 0;
  $('pl-cut-range').disabled = !b.up;
  $('pl-cut-range').value = pl.cut;
  $('pl-canvas').setAttribute('aria-label', fill('plCanvas', { name }));
  await updateCalibration();
}

// Slider → AI model → sky at the observing time → can the instrument reach the target?
async function updateCalibration() {
  const b = pl.b;
  if (!b || !pl.inputs) return;
  const lang = getLang();
  setText('pl-cut-v', ltr(`${pl.cut}%`));
  const sky = result.engine.predictWithLightFactor(pl.inputs, Math.max(0.001, 1 - pl.cut / 100));
  const lim = limitingMag(sky, pl.inst_.mm);
  const sees = b.up && b.need <= lim;
  const vars = { sky: sky.toFixed(2), b: bortleFromSqm(sky), goal: b.goal[lang], inst: pl.inst_[lang], name: b[lang],
    need: b.requiredSqm == null ? t('plImpossible') : b.requiredSqm.toFixed(2) };
  $('pl-read').innerHTML = !b.up ? fill('plReadBelow', vars)
    : `<span class="${sees ? 'ok' : 'no'}">${fill(sees ? 'plReadOk' : 'plReadNo', vars)}</span>`;
  setText('pl-caption', fill('plCaption', { sqm: sky.toFixed(2) }));
  if ($('panel-planets').hidden || pl.glFailed) return;
  try {
    if (!pl.viewer) {
      const { PlanetViewer } = await import('./modules/planetViewer.js');
      pl.viewer = pl.viewer || new PlanetViewer($('pl-canvas'), { reducedMotion: REDUCED_MOTION });
    }
    pl.viewer.show({ key: b.key, sqm: sky, showMoons: sees, altitude: b.up ? b.alt : 5 });
  } catch (err) {
    console.warn('3D view unavailable', err);
    pl.glFailed = true;
    setText('pl-caption', t('plNoGl'));
  }
}

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function renderSkyCanvas(id, mag, starCount) {
  const canvas = $(id);
  const w = canvas.width = Math.max(1, canvas.clientWidth) * 2;
  const h = canvas.height = Math.max(1, canvas.clientHeight) * 2;
  const ctx = canvas.getContext('2d');
  const glow = Math.max(0, Math.min(1, (21.5 - mag) / 4.5));   // 0 = dark sky, 1 = city

  const sky = ctx.createLinearGradient(0, h, 0, 0);
  sky.addColorStop(0, `rgb(${Math.round(12 + 40 * glow)},${Math.round(14 + 34 * glow)},${Math.round(26 + 34 * glow)})`);
  sky.addColorStop(1, `rgb(${Math.round(4 + 14 * glow)},${Math.round(6 + 14 * glow)},${Math.round(14 + 18 * glow)})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (glow > 0.1) {
    const dome = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, h);
    dome.addColorStop(0, `rgba(233,192,122,${(glow * 0.45).toFixed(2)})`);
    dome.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dome;
    ctx.fillRect(0, 0, w, h);
  }
  const rng = seededRandom(42);
  const n = Math.min(Math.round(starCount * 0.6), 2500);
  const alpha = Math.max(0.25, 1 - glow ** 1.5);
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h * 0.9, r = rng() * 1.6 + 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(235,240,255,${((rng() * 0.5 + 0.5) * alpha).toFixed(2)})`;
    ctx.fill();
  }
}

// ── Model transparency section ──
const FEATURE_NAMES = {
  ar: { log_rad_point: 'إشعاع ناسا ٢٠٢٤ في الموقع', log_rad_skyglow: 'توهج المدن المحيطة', log_rad_10km: 'الإشعاع ضمن ١٠ كم', log_rad_10_50km: 'الإشعاع ١٠–٥٠ كم', log_rad_50_160km: 'الإشعاع ٥٠–١٦٠ كم', log_light_point: 'ضوء ناسا في الموقع', log_skyglow: 'توهج المدن المحيطة', log_light_10km: 'الضوء ضمن ١٠ كم', log_light_10_50km: 'الضوء ١٠–٥٠ كم', log_light_50_160km: 'الضوء ٥٠–١٦٠ كم', solar_hour: 'وقت الليل', cloud: 'الغيوم', moon_light: 'ضوء القمر', moon_illum: 'طور القمر', moon_alt: 'ارتفاع القمر', elevation_km: 'الارتفاع', sun_alt: 'الشفق', abs_lat: 'خط العرض', season: 'الموسم' },
  en: { log_rad_point: 'NASA 2024 radiance at site', log_rad_skyglow: 'Glow from nearby cities', log_rad_10km: 'Radiance within 10 km', log_rad_10_50km: 'Radiance 10–50 km', log_rad_50_160km: 'Radiance 50–160 km', log_light_point: 'NASA light at site', log_skyglow: 'Glow from nearby cities', log_light_10km: 'Light within 10 km', log_light_10_50km: 'Light 10–50 km', log_light_50_160km: 'Light 50–160 km', solar_hour: 'Time of night', cloud: 'Clouds', moon_light: 'Moonlight', moon_illum: 'Moon phase', moon_alt: 'Moon altitude', elevation_km: 'Elevation', sun_alt: 'Twilight', abs_lat: 'Latitude', season: 'Season' }
};

function renderModelSection() {
  const primary = modelV2 || model;
  const m = primary.metrics;
  if (!m) return;
  const ai = m.cv[m.model] || m.cv.orbit_ai_v2;
  const sat = m.cv.satellite_only;
  setText('m-kpi', `${m.improvement_percent}%`);
  setText('m-mae', ltr(`${sat.MAE} → ${ai.MAE} mag`));
  setText('m-within', m.within_half_mag_pct != null ? `${m.within_half_mag_pct}%` : '—');
  setText('m-data', `${m.training_rows.toLocaleString(locale())} · ${m.unique_locations.toLocaleString(locale())} ${t('locations')}`);
  const names = FEATURE_NAMES[getLang()];
  const imp = Object.entries(primary.importances).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = imp[0][1];
  $('m-importance').innerHTML = imp.map(([k, v]) => `
    <div class="bar"><span>${names[k] || k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div>
      <em>${Math.round(v * 100)}%</em></div>`).join('');
}

// ── Map ──
function initMap() {
  if (!window.L) return;
  map = L.map('map', { center: [36.2, 43.2], zoom: 8, zoomControl: false });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 19, className: 'base-tiles'
  }).addTo(map);

  nasaLayer = L.tileLayer(GIBS_BLACK_MARBLE.url, {
    attribution: GIBS_BLACK_MARBLE.attribution,
    maxNativeZoom: GIBS_BLACK_MARBLE.maxNativeZoom,
    maxZoom: GIBS_BLACK_MARBLE.maxZoom,
    opacity: 0.6
  }).addTo(map);
  $('nasa-toggle').addEventListener('change', e => {
    if (e.target.checked) nasaLayer.addTo(map); else map.removeLayer(nasaLayer);
  });

  for (const [key, s] of Object.entries(SITES)) {
    siteMarkers[key] = L.marker([s.lat, s.lon], {
      icon: L.divIcon({ className: '', html: '<div class="site-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      title: s.nameEn
    }).addTo(map)
      .bindTooltip(() => placeName(s))
      .on('click', () => selectSite(key));
  }

  GAS_FLARES.forEach(f => {
    L.circle([f.lat, f.lon], { radius: f.radiusM, color: '#e9c07a', weight: 1.5, dashArray: '5,5', fillOpacity: 0.08 })
      .addTo(map).bindTooltip(() => (getLang() === 'ar' ? f.nameAr : f.nameEn), { sticky: true });
  });

  map.on('click', async e => {
    const { lat, lng } = e.latlng;
    const alt = await fetchElevation(lat, lng);
    const label = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
    predictPlace({ key: 'custom', lat, lon: lng, alt, nameEn: label, nameAr: label });
  });

  initSatellites();
  $('btn-view-mosul').addEventListener('click', () => map.flyTo([36.35, 43.13], 10, { duration: 0.8, animate: !REDUCED_MOTION }));
  $('btn-view-iraq').addEventListener('click', () => map.flyTo([33.3, 44.3], 6, { duration: 0.8, animate: !REDUCED_MOTION }));
}

function highlightMarker(place) {
  if (!map) return;
  Object.entries(siteMarkers).forEach(([k, m]) => {
    m.getElement()?.querySelector('.site-pin')?.classList.toggle('active', k === place.key);
  });
  if (customMarker) { map.removeLayer(customMarker); customMarker = null; }
  if (place.key === 'custom') {
    customMarker = L.marker([place.lat, place.lon], {
      icon: L.divIcon({ className: '', html: '<div class="site-pin active"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false
    }).addTo(map);
  }
}

function initSatellites() {
  const tracker = new SatelliteTracker();
  const markers = {};
  tracker.satellites.forEach(sat => {
    const pos = tracker.getCurrentPosition(sat.id);
    if (!pos) return;
    markers[sat.id] = L.marker([pos.lat, pos.lon], {
      icon: L.divIcon({ className: '', html: `<div style="font-size:18px">${sat.icon}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 1000
    }).addTo(map).bindTooltip(sat.name, { direction: 'top' });
  });
  setInterval(() => {
    tracker.satellites.forEach(sat => {
      const pos = tracker.getCurrentPosition(sat.id);
      if (pos && markers[sat.id]) markers[sat.id].setLatLng([pos.lat, pos.lon]);
    });
  }, 5000);
}

// ── Community observations (produced by ml/04_analyze_photos.py) ──
async function loadObservations() {
  try {
    const r = await fetch(`${BASE}data/observations.json`);
    if (r.ok) observations = await r.json();
    const p = await fetch(`${BASE}data/observation_places.json`);
    if (p.ok) photoPlaces = (await p.json()).photos || {};
  } catch { /* no photos yet */ }
  renderObservations();
  addPhotoMarkers();
}

// Where a photo is shown: its illustrative Nineveh place if there is one, else the real spot
function photoPlace(o) {
  const p = photoPlaces[o.thumb];
  return p ? { ...p, illustrative: true } : { place: o.site, place_ar: o.site_ar, lat: o.lat, lon: o.lon, notes: o.notes, notes_ar: o.notes_ar, model_sqm: o.model_sqm, illustrative: false };
}

function checkPhotoPlace(o) {
  const p = photoPlace(o);
  predictPlace({ key: 'custom', lat: p.lat, lon: p.lon, alt: p.elevation_m ?? 300, nameEn: p.place, nameAr: p.place_ar || p.place });
  map?.flyTo([p.lat, p.lon], 11, { duration: 0.8, animate: !REDUCED_MOTION });
  $('app').scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

function addPhotoMarkers() {
  if (!map || !observations.length) return;
  photoMarkers.splice(0).forEach(m => map.removeLayer(m));
  observations.forEach(o => {
    const p = photoPlace(o);
    const m = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', html: '<div class="photo-pin" aria-hidden="true">📷</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: p.place
    });
    if ($('photo-toggle').checked) m.addTo(map);
    m.bindPopup(() => {
      const ar = getLang() === 'ar';
      return `<div class="photo-pop"><img src="${BASE}${o.thumb}" alt="" width="180" />
        <strong>${(ar && p.place_ar) || p.place}</strong>${p.illustrative ? `<span class="tag">📍 ${t('obsIllustrative')}</span>` : ''}
        <span>${(ar && p.notes_ar) || p.notes || ''}</span></div>`;
    });
    photoMarkers.push(m);
  });
}

function renderObservations() {
  const box = $('obs-gallery');
  if (!observations.length) {
    box.innerHTML = `<p class="empty">${t('obsEmpty')}</p>`;
    return;
  }
  const sorted = [...observations].sort((a, b) => (a.kind === 'telescope') - (b.kind === 'telescope'));
  const note = $('obs-note');
  if (note) note.hidden = !Object.keys(photoPlaces).length;
  box.innerHTML = sorted.map(o => {
    const when = o.local_datetime ? new Date(o.local_datetime.replace(' ', 'T')) : null;
    const ar = getLang() === 'ar';
    const p = photoPlace(o);
    const site = (ar && p.place_ar) || p.place || '';
    const notes = (ar && p.notes_ar) || p.notes || '';
    const sqm = p.model_sqm ?? o.model_sqm;
    const b = bortleFromSqm(sqm);
    const moonUp = (o.moon_alt ?? -1) > 0;
    const tag = o.kind === 'telescope' ? t('obsTelescope')
      : moonUp ? `🌙 ${t('obsMoonUp')} ${Math.round(o.moon_illum * 100)}%` : t('obsMoonDown');
    return `
    <figure class="obs">
      <div class="obs-media"><img src="${BASE}${o.thumb}" alt="${notes || site}" loading="lazy" />${p.illustrative ? `<span class="tag tag-img">📍 ${t('obsIllustrative')}</span>` : ''}</div>
      <figcaption>
        <span class="o-site">${site}</span>
        ${notes ? `<span class="o-note">${notes}</span>` : ''}
        <div class="o-meta">
          <span>${when ? when.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
          <span class="tag">${tag}</span>
        </div>
        <div class="o-meta"><span>${t('obsModel')}</span><span class="o-pred">${ltr(`${fmt(sqm)} · B${b}`)}</span></div>
        <button type="button" class="link-btn o-check" data-thumb="${o.thumb}">${t('obsCheck')}</button>
      </figcaption>
    </figure>`;
  }).join('');
}
