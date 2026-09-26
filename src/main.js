// ── Orbit Galaxy — Main App ──
// Clean single-page: Starfield → ESP32 Sim → NASA → AI → DarkSky → Map

import { Starfield } from './modules/starfield.js';
import { ESP32Station } from './modules/esp32.js';
import { NasaDataService } from './modules/nasaApi.js';
import { AIEngine } from './modules/aiEngine.js';
import { DarkSkySimulator } from './modules/darkSkySimulator.js';
import { PlanetSimulator } from './modules/planetSimulator.js';
import { setLang, getLang } from './modules/i18n.js';
import { SatelliteTracker } from './modules/satelliteTracker.js';
import Lenis from 'lenis';

let starfield, esp32, nasa, ai, darkSky, map, satTracker, planetSim;
let nasaOverlay = null;
let nasaOverlayVisible = false;

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  starfield = new Starfield('stars');
  nasa = new NasaDataService();
  esp32 = new ESP32Station(onData);
  ai = new AIEngine(nasa, esp32);
  darkSky = new DarkSkySimulator(esp32);
  satTracker = new SatelliteTracker();
  planetSim = new PlanetSimulator('planet-canvas');

  bindSiteSelect();
  bindDarkSky();
  bindAutoCalibration();
  bindNasaToggle();
  bindLangToggle();
  initScrollReveal();

  onData(esp32.data);
  updateAI();
  updateDarkSky(true);

  // Premium smooth scrolling
  try {
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 1.6,
      smoothWheel: true,
      syncTouch: false,
    });
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  } catch (err) {
    console.warn('Smooth scroll fallback to native:', err);
  }

  setTimeout(initMap, 300);
});

// ── Language & Theme Toggle ──
function bindLangToggle() {
  const langBtn = document.getElementById('btn-lang');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const newLang = getLang() === 'en' ? 'ar' : 'en';
      setLang(newLang);
      langBtn.textContent = newLang === 'en' ? 'عربي' : 'English';
      updateAutoCalibration();
    });
  }

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        themeBtn.textContent = '☀️';
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        themeBtn.textContent = '🌙';
      }
    });
  }
}

// ── Site Selector ──
function bindSiteSelect() {
  const sel = document.getElementById('site-select');
  sel.addEventListener('change', () => {
    esp32.setSite(sel.value);
    const cardSel = document.getElementById('calib-site-select');
    if (cardSel) cardSel.value = sel.value;
    if (map) flyTo(sel.value);
    updateAI();
    updateDarkSky(true);
    resetPlanetViewModeToCurrent();
    updateAutoCalibration();
  });
}

// ── ESP32 USB Connect ──
function bindESP32Connect() {
  const btn = document.getElementById('btn-esp32');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (esp32.isConnected) {
      await esp32.disconnectSerial();
      btn.textContent = '⚡ Connect ESP32 via USB';
      btn.classList.remove('connected');
      document.getElementById('demo-dot').className = 'demo-dot green';
      document.getElementById('demo-status').textContent = 'SIMULATOR ACTIVE';
      document.getElementById('demo-status').style.color = '';
    } else {
      try {
        btn.textContent = '⏳ Connecting...';
        await esp32.connectWebSerial();
        btn.textContent = '🔌 Disconnect ESP32';
        btn.classList.add('connected');
        document.getElementById('demo-dot').className = 'demo-dot green';
        document.getElementById('demo-status').textContent = 'ESP32 LIVE';
        document.getElementById('demo-status').style.color = '#00e676';
      } catch (e) {
        btn.textContent = '⚡ Connect ESP32 via USB';
        // Show inline error
        const msg = e.message.includes('Serial') 
          ? 'WebSerial requires Chrome or Edge browser.' 
          : e.message;
        alert('Connection failed: ' + msg);
      }
    }
  });
}

// ── ESP32 Settings ──
function bindESPSettings() {
  const btn = document.getElementById('btn-esp-settings');
  const panel = document.getElementById('esp-settings-panel');
  if (btn && panel) {
    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  }

  const calibSlider = document.getElementById('esp-calib-slider');
  const calibVal = document.getElementById('esp-calib-val');
  if (calibSlider && calibVal) {
    calibSlider.addEventListener('input', () => {
      const val = parseFloat(calibSlider.value);
      calibVal.textContent = val > 0 ? '+' + val.toFixed(1) : val.toFixed(1);
      // In a real app we'd send this to ESP32 via Serial. Here we adjust the UI.
      esp32.data.calibratedMag = esp32.data.rawMag + val;
      onData(esp32.data);
      updateDarkSky();
    });
  }
}

// ── NASA Overlay Toggle ──
function bindNasaToggle() {
  const btn = document.getElementById('btn-nasa-layer');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!map) return;
    nasaOverlayVisible = !nasaOverlayVisible;
    btn.classList.toggle('active', nasaOverlayVisible);

    if (nasaOverlayVisible && !nasaOverlay) {
      const layer = nasa.getGibsLayer('blackMarble');
      nasaOverlay = L.tileLayer(layer.url, {
        attribution: layer.attribution,
        maxZoom: layer.maxZoom,
        opacity: 0.7
      });
      nasaOverlay.addTo(map);
    } else if (nasaOverlayVisible && nasaOverlay) {
      nasaOverlay.addTo(map);
    } else if (!nasaOverlayVisible && nasaOverlay) {
      map.removeLayer(nasaOverlay);
    }
  });
}

// ── Data Update from ESP32 ──
function onData(d) {
  setText('v-lat', d.lat.toFixed(4) + '°');
  setText('v-lon', d.lon.toFixed(4) + '°');
  setText('v-alt', d.alt + 'm');
  setText('v-ch0', d.ch0);
  setText('v-ch1', d.ch1);
  setText('v-pitch', d.pitch.toFixed(1) + '°');

  // Sky quality
  setText('v-sqm', d.calibratedMag.toFixed(2));
  setText('v-nelm', d.nelm.toFixed(2));
  setText('v-bortle', d.bortle);

  // Color code bortle
  const bEl = document.getElementById('v-bortle');
  if (bEl) bEl.className = 'tele-val ' + (d.bortle <= 3 ? 'green' : d.bortle <= 5 ? '' : d.bortle <= 7 ? 'amber' : 'red');

  // Color code SQM
  const sqmEl = document.getElementById('v-sqm');
  if (sqmEl) sqmEl.className = 'tele-val ' + (d.calibratedMag >= 21 ? 'green' : d.calibratedMag >= 19 ? '' : d.calibratedMag >= 18 ? 'amber' : 'red');

  // NELM color
  const nelmEl = document.getElementById('v-nelm');
  if (nelmEl) nelmEl.className = 'tele-val ' + (d.nelm >= 6 ? 'green' : d.nelm >= 4.5 ? '' : 'amber');

  // Bortle desc
  const descs = { 1: 'Pristine', 2: 'Truly Dark', 3: 'Rural', 4: 'Rural/Sub', 5: 'Suburban', 6: 'Bright Sub', 7: 'Sub/Urban', 8: 'City Sky', 9: 'Inner City' };
  setText('v-bortle-desc', descs[d.bortle] || '');

  // Lamp
  setText('v-lamp', d.lampType);
  const lampEl = document.getElementById('v-lamp');
  if (lampEl && d.lampColor) lampEl.style.color = d.lampColor;
}

// ── AI Update ──
function updateAI() {
  const site = esp32.sites[esp32.currentSiteKey];
  const flare = nasa.isInsideGasFlareZone(site.lat, site.lon);

  const r = ai.predict({
    satelliteRadiance: site.radiance,
    visibleIrRatio: esp32.data.visibleIrRatio,
    distKm: site.distKm,
    elevation: site.alt,
    dustAOD: nasa.environment.dustAOD,
    moonIllum: nasa.environment.moonPhase * 100,
    moonAlt: nasa.environment.moonAltitude,
    isGasFlare: flare.isFlare
  });

  setText('v-sat-est', r.satelliteEstimate.toFixed(2));
  setText('v-ai-est', r.predictedMag.toFixed(2));
  setText('v-kpi', ai.metrics.improvementPercent.toFixed(1) + '%');
}

// ── DarkSky Controls ──
function bindDarkSky() {
  const sliders = [
    { el: 'ds-useful', key: 'useful', display: 'ds-useful-v', suffix: '%' },
    { el: 'ds-targeted', key: 'targeted', display: 'ds-targeted-v', suffix: '%' },
    { el: 'ds-dimming', key: 'dimming', display: 'ds-dimming-v', suffix: '%' }
  ];

  sliders.forEach(s => {
    const input = document.getElementById(s.el);
    if (!input) return;
    input.addEventListener('input', () => {
      document.getElementById(s.display).textContent = input.value + s.suffix;
      darkSky.setParam(s.key, parseInt(input.value, 10));
      updateDarkSky();
    });
  });

  const curfew = document.getElementById('ds-curfew');
  if (curfew) curfew.addEventListener('change', e => {
    darkSky.setParam('curfew', e.target.checked);
    updateDarkSky();
  });

  const warm = document.getElementById('ds-warm');
  if (warm) warm.addEventListener('change', e => {
    darkSky.setParam('warmColor', e.target.checked);
    updateDarkSky();
  });
}

// ── Auto-Calibration / Smart Intervention System ──
function resetPlanetViewModeToCurrent() {
  const btnCurrent = document.getElementById('btn-mode-current');
  const btnCalib = document.getElementById('btn-mode-calibrated');
  if (btnCurrent && btnCalib) {
    btnCurrent.classList.add('active');
    btnCalib.classList.remove('active');
  }
  if (planetSim) planetSim.setViewMode('current');
}

function updateAutoCalibration() {
  const targetSelect = document.getElementById('calib-target-select');
  if (!targetSelect) return;

  const currentSite = (esp32 && esp32.sites) ? esp32.sites[esp32.currentSiteKey] : null;
  const siteName = currentSite
    ? (getLang() === 'ar' ? currentSite.nameAr : currentSite.nameEn)
    : 'Mosul Downtown';
  const B_old = currentSite ? currentSite.baseMag : 17.00;
  const B_target = parseFloat(targetSelect.value);

  // Sync with card site select dropdown
  const cardSiteSel = document.getElementById('calib-site-select');
  if (cardSiteSel && esp32 && esp32.currentSiteKey) {
    cardSiteSel.value = esp32.currentSiteKey;
  }

  setText('calib-site-name', siteName);
  setText('calib-current-val', B_old.toFixed(2));

  // Unified measurements: Bortle, NELM, and Coordinates matching Ground Station & Map above
  const bortleVal = currentSite ? currentSite.bortle : (esp32 ? esp32.data.bortle : 8);
  setText('calib-current-bortle', `Bortle ${bortleVal}`);
  const curNELM = esp32 ? esp32.calculateNELM(B_old) : 3.28;
  setText('calib-current-nelm', `NELM ${curNELM.toFixed(2)}`);
  if (currentSite) {
    setText('calib-current-coords', `📍 ${currentSite.lat.toFixed(4)}°N, ${currentSite.lon.toFixed(4)}°E · Alt ${currentSite.alt}m`);
  }

  // Formula A: Calculate required dimming percentage (d_percent)
  // d = 1 - (10 ^ (- (B_target - B_old) / 2.5))
  // d_percent = d * 100
  // Note: If d_percent >= 100, cap it at 99.9%. If B_target <= B_old, sky is already suitable!
  let d_percent = 0;
  if (B_target > B_old) {
    const d = 1.0 - Math.pow(10, -(B_target - B_old) / 2.5);
    d_percent = d * 100.0;
    if (d_percent >= 100.0) d_percent = 99.9;
    setText('calib-res-reduction', d_percent.toFixed(2) + '%');
  } else {
    d_percent = 0.0;
    const cleanMsg = getLang() === 'ar' ? '٠.٠٠٪ (السماء مناسبة جداً لهذا الكوكب! ✨)' : '0.00% (Sky already clear! ✨)';
    setText('calib-res-reduction', cleanMsg);
  }

  // Formula B: Calculate Naked Eye Limiting Magnitude (NELM) using the Unihedron formula:
  // Term = (10 ^ (4.316 - (B_target / 5))) + 1
  // NELM = 7.93 - (5 * Math.log10(Term))
  const Term = Math.pow(10, 4.316 - (B_target / 5.0)) + 1.0;
  const NELM = 7.93 - (5.0 * Math.log10(Term));

  setText('calib-res-nelm', NELM.toFixed(2));
  setText('calib-res-target', B_target.toFixed(2) + ' mag/arcsec²');

  // Sync with interactive 3D planet telescope simulator & guidance
  const selectedOpt = targetSelect.options[targetSelect.selectedIndex];
  const planetKey = selectedOpt ? (selectedOpt.getAttribute('data-planet') || 'jupiter') : 'jupiter';

  if (planetSim) {
    planetSim.setPlanet(planetKey);
    planetSim.setSiteData(
      siteName,
      B_old,
      B_target,
      currentSite ? currentSite.lat : 36.3587,
      currentSite ? currentSite.lon : 43.1307
    );
  }
}

function bindAutoCalibration() {
  const btn = document.getElementById('btn-calc-calib');
  const targetSelect = document.getElementById('calib-target-select');
  const cardSiteSel = document.getElementById('calib-site-select');
  if (!btn || !targetSelect) return;

  // In-card site selector change event
  if (cardSiteSel) {
    cardSiteSel.addEventListener('change', () => {
      const siteKey = cardSiteSel.value;
      if (esp32) esp32.setSite(siteKey);
      const topSel = document.getElementById('site-select');
      if (topSel) topSel.value = siteKey;
      if (map) flyTo(siteKey);
      updateAI();
      updateDarkSky(true);
      resetPlanetViewModeToCurrent();
      updateAutoCalibration();
    });
  }

  // Target planet change event
  targetSelect.addEventListener('change', () => {
    resetPlanetViewModeToCurrent();
    updateAutoCalibration();
  });

  // Calculate Auto-Calibration button click
  btn.addEventListener('click', () => {
    // Automatically switch telescope to Calibrated Sky mode so user immediately sees the crystal-clear view!
    const btnCurrent = document.getElementById('btn-mode-current');
    const btnCalib = document.getElementById('btn-mode-calibrated');
    if (btnCurrent && btnCalib) {
      btnCalib.classList.add('active');
      btnCurrent.classList.remove('active');
    }
    if (planetSim) planetSim.setViewMode('calibrated');

    updateAutoCalibration();
    btn.style.transform = 'scale(0.98)';
    setTimeout(() => { btn.style.transform = ''; }, 150);
  });

  // Handle telescope view mode toggle (Current Sky vs Calibrated Sky)
  const btnCurrent = document.getElementById('btn-mode-current');
  const btnCalib = document.getElementById('btn-mode-calibrated');

  if (btnCurrent && btnCalib) {
    btnCurrent.addEventListener('click', () => {
      btnCurrent.classList.add('active');
      btnCalib.classList.remove('active');
      if (planetSim) planetSim.setViewMode('current');
    });

    btnCalib.addEventListener('click', () => {
      btnCalib.classList.add('active');
      btnCurrent.classList.remove('active');
      if (planetSim) planetSim.setViewMode('calibrated');
    });
  }

  // Global helper to smoothly select and scroll to Auto-Calibration from map popups
  window.scrollToCalib = function(siteKey) {
    if (siteKey && esp32) {
      esp32.setSite(siteKey);
      const sel = document.getElementById('site-select');
      if (sel) sel.value = siteKey;
      const cardSel = document.getElementById('calib-site-select');
      if (cardSel) cardSel.value = siteKey;
      updateAI();
      updateDarkSky(true);
      resetPlanetViewModeToCurrent();
      updateAutoCalibration();
    }
    const calibEl = document.querySelector('.calib-card');
    if (calibEl) calibEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Initial calculation on load
  updateAutoCalibration();
}

let lastRenderedBeforeSite = null;

function updateDarkSky(forceRedrawBefore = false) {
  const currentSite = (esp32 && esp32.sites) ? esp32.sites[esp32.currentSiteKey] : null;
  const baseMag = currentSite ? currentSite.baseMag : (esp32 ? esp32.data.calibratedMag : 17.30);
  const result = darkSky.calculateImpact(baseMag);

  setText('ds-gain', '+' + result.totalGain.toFixed(2));
  setText('ds-stars', '+' + result.additionalStars.toLocaleString());
  setText('ds-energy', result.energyReductionPct + '%');

  const beforeBortle = currentSite ? currentSite.bortle : (esp32 ? esp32.data.bortle : 8);
  const afterBortle = esp32 ? esp32.calculateBortle(result.simulatedMag) : 6;
  setText('sky-before-mag', result.baseMag.toFixed(2) + ' mag');
  setText('sky-after-mag', result.simulatedMag.toFixed(2) + ' mag');
  setText('sky-before-bortle', 'Bortle ' + beforeBortle);
  setText('sky-after-bortle', 'Bortle ' + afterBortle);

  // Only redraw BEFORE on site change or initial load
  const siteKey = esp32 ? esp32.currentSiteKey : 'default';
  if (forceRedrawBefore || lastRenderedBeforeSite !== siteKey) {
    renderSkyCanvas('sky-before-canvas', result.baseMag, result.starsBefore);
    lastRenderedBeforeSite = siteKey;
  }

  renderSkyCanvas('sky-after-canvas', result.simulatedMag, result.starsAfter);
}

// ── Sky Canvas Renderer ──
// Seed-based random for consistent star positions
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function renderSkyCanvas(canvasId, mag, starCount) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Protect against zero dimensions (display:none) which crashes createRadialGradient
  const w = canvas.width = (canvas.offsetWidth || 400) * 2;
  const h = canvas.height = (canvas.offsetHeight || 200) * 2;

  // Protect against NaN
  mag = mag || 20;
  starCount = starCount || 500;

  // Sky glow gradient based on magnitude
  // Lower mag = brighter sky = more haze and horizon glow
  // Higher mag = darker sky = deep blue and thousands of stars
  // Adjusted formula to make the transition visually dramatic
  const brightness = Math.max(0, Math.min(1, (21.5 - mag) / 4.5));

  ctx.clearRect(0, 0, w, h); // Fix glitching

  // Realistic night sky base (always deep blue/black, but hazier when polluted)
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  if (brightness > 0.6) {
    // Heavily polluted (Hazy gray-blue)
    grad.addColorStop(0, `rgba(35, 40, 55, 1)`);
    grad.addColorStop(0.5, `rgba(20, 25, 40, 1)`);
    grad.addColorStop(1, `rgba(15, 15, 30, 1)`);
  } else if (brightness > 0.3) {
    // Moderate pollution (Darker blue)
    grad.addColorStop(0, `rgba(20, 25, 45, 1)`);
    grad.addColorStop(0.5, `rgba(10, 15, 30, 1)`);
    grad.addColorStop(1, `rgba(5, 5, 20, 1)`);
  } else {
    // Dark sky (Deep midnight/black)
    grad.addColorStop(0, `rgba(6, 8, 18, 1)`);
    grad.addColorStop(0.5, `rgba(3, 4, 12, 1)`);
    grad.addColorStop(1, `rgba(1, 2, 8, 1)`);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // City glow dome at horizon (yellowish/white skyglow reflecting off particles)
  if (brightness > 0.1) {
    const radius = Math.max(1, h * 0.85); // Prevent IndexSizeError in browser rendering
    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 1.0, 0, w * 0.5, h * 1.0, radius);
    const glowAlpha = Math.min(1.0, brightness * 0.7);
    // Use an amber/warm-white hue to simulate city streetlights
    glowGrad.addColorStop(0, `rgba(255, 210, 140, ${glowAlpha})`);
    glowGrad.addColorStop(0.4, `rgba(200, 150, 90, ${glowAlpha * 0.4})`);
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // Draw stars — use seeded random so positions stay consistent
  const rng = seededRandom(42);
  // Visually multiply stars and allow a much higher cap to create a dramatic "wow" effect when slider is moved
  const maxStars = Math.min(starCount * 3, 2500);
  const starAlpha = Math.max(0.2, 1 - Math.pow(brightness, 1.5));

  for (let i = 0; i < maxStars; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.85;
    const r = rng() * 1.8 + 0.3;
    const a = (rng() * 0.5 + 0.5) * starAlpha;

    // Star color variation
    const colors = ['255,255,255', '200,220,255', '255,240,200', '180,210,255'];
    const c = colors[Math.floor(rng() * colors.length)];

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c}, ${a})`;
    if (r > 1.2) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = `rgba(${c}, ${a * 0.5})`;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ── Leaflet Map ──
function initMap() {
  const container = document.getElementById('map');
  if (!container || !window.L) return;

  map = L.map('map', { center: [36.35, 43.13], zoom: 9, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Free dark basemap — OSM tiles with CSS dark filter (no API key needed)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    className: 'dark-tiles'
  }).addTo(map);

  // Observation sites
  const sites = [
    { key: 'sinjar', name: 'Mt. Sinjar (Bortle 2)', coords: [36.371, 41.874], c: '#00e676', mag: '21.85' },
    { key: 'hatra', name: 'Al-Hatra (Bortle 3)', coords: [35.589, 42.718], c: '#00d4ff', mag: '21.40' },
    { key: 'badush', name: 'Badush (Bortle 4)', coords: [36.561, 43.112], c: '#76ff03', mag: '20.75' },
    { key: 'baashiqa', name: "Ba'ashiqa (Bortle 5)", coords: [36.452, 43.348], c: '#ffab00', mag: '19.60' },
    { key: 'mosulCenter', name: 'Mosul Center (Bortle 8)', coords: [36.359, 43.131], c: '#ff4060', mag: '17.00' },
    { key: 'baghdadCenter', name: 'Baghdad Center (Bortle 9)', coords: [33.3152, 44.3661], c: '#ff1744', mag: '16.80' },
    { key: 'basraCenter', name: 'Basra Center (Bortle 8)', coords: [30.5081, 47.7835], c: '#ff4060', mag: '17.10' },
    { key: 'erbilCenter', name: 'Erbil Center (Bortle 8)', coords: [36.1911, 44.0092], c: '#ff4060', mag: '17.50' },
    { key: 'najafCenter', name: 'Najaf Center (Bortle 8)', coords: [31.9928, 44.3168], c: '#ff4060', mag: '17.60' },
    { key: 'nasiriyahCenter', name: 'Nasiriyah (Bortle 8)', coords: [31.0427, 46.2592], c: '#ff4060', mag: '17.80' },
    { key: 'sulaymaniyahCenter', name: 'Sulaymaniyah (Bortle 8)', coords: [35.5558, 45.4351], c: '#ffab00', mag: '17.40' },
    { key: 'ramadiCenter', name: 'Ramadi (Bortle 7)', coords: [33.4243, 43.3021], c: '#ffab00', mag: '18.20' },
    { key: 'kirkukCenter', name: 'Kirkuk (Bortle 8)', coords: [35.4673, 44.3855], c: '#ff4060', mag: '17.50' },
    { key: 'rutba', name: 'Ar-Rutbah Desert (Bortle 2)', coords: [33.0381, 40.2806], c: '#00e676', mag: '21.90' }
  ];

  window._mapMarkers = {};

  sites.forEach(s => {
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:20px;height:20px;position:relative;">
        <div style="position:absolute;inset:4px;border-radius:50%;background:${s.c};box-shadow:0 0 12px ${s.c};"></div>
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${s.c};animation:ring-pulse 2.5s infinite;opacity:0.5;"></div>
      </div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker(s.coords, { icon }).addTo(map);
    marker.bindPopup(`
      <strong style="color:${s.c}">${s.name}</strong><br/>
      ${s.mag} mag/arcsec²<br/>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:0.65rem;margin-top:6px;width:100%;justify-content:center;cursor:pointer;" onclick="window.scrollToCalib('${s.key}')">🎯 Calibrate for this Site</button>
    `);
    marker.on('click', () => {
      document.getElementById('site-select').value = s.key;
      const cardSel = document.getElementById('calib-site-select');
      if (cardSel) cardSel.value = s.key;
      esp32.setSite(s.key);
      updateAI();
      updateDarkSky(true);
      resetPlanetViewModeToCurrent();
      updateAutoCalibration();
    });
    window._mapMarkers[s.key] = marker;
  });

  // Gas flare exclusion zones
  [
    { lat: 35.801, lon: 43.272, r: 9000, name: 'Qayyarah Oil Flares' },
    { lat: 35.912, lon: 43.148, r: 6500, name: 'Najmah Oil Flares' }
  ].forEach(f => {
    L.circle([f.lat, f.lon], {
      radius: f.r,
      color: '#ff4060',
      weight: 1.5,
      dashArray: '5,5',
      fillColor: '#ff4060',
      fillOpacity: 0.12
    }).addTo(map).bindTooltip(`⚠️ ${f.name} — Masked from model`, { sticky: true });
  });

  // Enable NASA overlay by default
  const nasaBtn = document.getElementById('btn-nasa-layer');
  if (nasaBtn) {
    nasaBtn.click();
  }

  // Pollution Glow (Heatmap Effect) for major cities
  const pollutionCenters = [
    { name: 'Mosul', coords: [36.35, 43.13], mult: 1.0 },
    { name: 'Baghdad', coords: [33.3152, 44.3661], mult: 2.5 }, // Baghdad is much larger
    { name: 'Basra', coords: [30.5081, 47.7835], mult: 1.5 },
    { name: 'Erbil', coords: [36.1911, 44.0092], mult: 1.2 },
    { name: 'Najaf', coords: [31.9928, 44.3168], mult: 1.1 },
    { name: 'Nasiriyah', coords: [31.0427, 46.2592], mult: 1.0 },
    { name: 'Sulaymaniyah', coords: [35.5558, 45.4351], mult: 1.1 },
    { name: 'Ramadi', coords: [33.4243, 43.3021], mult: 0.9 },
    { name: 'Kirkuk', coords: [35.4673, 44.3855], mult: 1.1 }
  ];

  const baseZones = [
    { r: 35000, c: '#00d4ff', o: 0.08, desc: 'Bortle 4-5 (Rural Transition)' },
    { r: 18000, c: '#ffab00', o: 0.2, desc: 'Bortle 6-7 (Suburbs)' },
    { r: 8000, c: '#ff4060', o: 0.35, desc: 'Bortle 8-9 (Inner City)' }
  ];
  
  pollutionCenters.forEach(center => {
    baseZones.forEach(zone => {
      L.circle(center.coords, {
        radius: zone.r * center.mult,
        color: 'none',
        fillColor: zone.c,
        fillOpacity: zone.o,
        className: 'pollution-glow'
      }).addTo(map).bindTooltip(`${center.name} - ${zone.desc}`);
    });
  });

  // Real-time Satellites (Multi)
  const satMarkers = {};
  
  satTracker.satellites.forEach(sat => {
    // Satellite Icon
    const satIcon = L.divIcon({
      className: 'sat-smooth',
      html: `<div style="font-size:24px; animation: bob 2s infinite;">${sat.icon}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    
    const initPos = satTracker.getCurrentPosition(sat.id);
    const marker = L.marker([initPos ? initPos.lat : 0, initPos ? initPos.lon : 0], { icon: satIcon, zIndexOffset: 1000 }).addTo(map);
    marker.bindTooltip(`${sat.name} - Realtime`, { direction: 'top' });
    satMarkers[sat.id] = marker;

    // Draw Orbit Path (Past 90m and Future 90m)
    const orbitPath = satTracker.getOrbitTrack(sat.id, new Date(), 90, 90, 2);
    
    // Split path if it wraps around the date line
    let currentSegment = [];
    const segments = [currentSegment];
    for (let i = 0; i < orbitPath.length; i++) {
      if (i > 0 && Math.abs(orbitPath[i][1] - orbitPath[i-1][1]) > 180) {
        currentSegment = [];
        segments.push(currentSegment);
      }
      currentSegment.push(orbitPath[i]);
    }
    
    segments.forEach(seg => {
      if (seg.length > 1) {
        L.polyline(seg, { color: sat.color, weight: 2, dashArray: '4, 6', opacity: 0.5 }).addTo(map);
      }
    });
  });
  
  // Update positions smoothly
  setInterval(() => {
    satTracker.satellites.forEach(sat => {
      const pos = satTracker.getCurrentPosition(sat.id);
      if (pos && satMarkers[sat.id]) {
        satMarkers[sat.id].setLatLng([pos.lat, pos.lon]);
      }
    });
  }, 1000);

  // Map Zoom Controls
  document.getElementById('btn-view-mosul')?.addEventListener('click', () => {
    map.flyTo([36.35, 43.13], 10, { duration: 1.0 });
  });
  document.getElementById('btn-view-iraq')?.addEventListener('click', () => {
    map.flyTo([33.3, 44.3], 6, { duration: 1.0 });
  });
  document.getElementById('btn-view-world')?.addEventListener('click', () => {
    map.flyTo([20, 0], 2, { duration: 1.5 });
  });
}

function flyTo(siteKey) {
  if (window._mapMarkers && window._mapMarkers[siteKey]) {
    map.flyTo(window._mapMarkers[siteKey].getLatLng(), 11, { duration: 1.0 });
    window._mapMarkers[siteKey].openPopup();
  }
}

// ── Scroll Reveal ──
function initScrollReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── Helper ──
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

