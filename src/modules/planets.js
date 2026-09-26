// Solar-system forecast: where each planet is tonight, how bright it is, and
// whether the site's sky (from the ORBIT AI model) lets you see it.
//
// Positions: NASA JPL "Keplerian Elements for Approximate Positions of the
// Major Planets" (E. M. Standish, table 1, valid 1800–2050; error ≲ 1′ for
// the inner planets, a few ′ for the outer ones) — https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Magnitudes: Astronomical Almanac / Meeus, "Astronomical Algorithms" ch. 41.
// Telescope limiting magnitude: NELM + 5·log10(D / 7 mm) − 0.5 (practical losses).

import { moonIllumination, moonPosition, raDecToAltAz, sunPosition } from './astro.js';
import { nelmFromSqm } from './skyMath.js';

const RAD = Math.PI / 180;

// a (AU), e, I, L, long.peri, long.node (deg) at J2000 + rates per Julian century
const ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto: [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
};

// V magnitude from r (sun distance), d (earth distance), i (phase angle, deg)
const MAGNITUDE = {
  mercury: (r, d, i) => -0.42 + 5 * Math.log10(r * d) + 0.0380 * i - 0.000273 * i * i + 0.000002 * i ** 3,
  venus: (r, d, i) => -4.40 + 5 * Math.log10(r * d) + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3,
  mars: (r, d, i) => -1.52 + 5 * Math.log10(r * d) + 0.016 * i,
  jupiter: (r, d, i) => -9.40 + 5 * Math.log10(r * d) + 0.005 * i,
  saturn: (r, d) => -8.88 + 5 * Math.log10(r * d),          // ring tilt adds up to ±0.5
  uranus: (r, d) => -7.19 + 5 * Math.log10(r * d),
  neptune: (r, d) => -6.87 + 5 * Math.log10(r * d),
  pluto: (r, d) => -1.00 + 5 * Math.log10(r * d)
};

// What to look for at each body. `mag` = the faintest thing that must be seen;
// glare = extra difficulty of a faint moon next to a bright planet.
// Surface details of bright planets depend on the telescope and air steadiness,
// NOT on light pollution — the page says so instead of pretending otherwise.
export const BODIES = [
  { key: 'moon', en: 'Moon', ar: 'القمر', goal: { en: 'craters and seas', ar: 'الفوهات والبحار' } },
  { key: 'mercury', en: 'Mercury', ar: 'عطارد', goal: { en: 'the planet in twilight', ar: 'الكوكب في الشفق' } },
  { key: 'venus', en: 'Venus', ar: 'الزهرة', goal: { en: 'its phase (crescent)', ar: 'أطواره (الهلال)' } },
  { key: 'mars', en: 'Mars', ar: 'المريخ', goal: { en: 'its red disk', ar: 'قرصه الأحمر' } },
  { key: 'jupiter', en: 'Jupiter', ar: 'المشتري', goal: { en: 'its 4 Galilean moons', ar: 'أقماره الأربعة (أقمار غاليليو)' }, faint: 5.6, glare: 1.5 },
  { key: 'saturn', en: 'Saturn', ar: 'زحل', goal: { en: 'its moon Titan', ar: 'قمره تيتان' }, faint: 8.4, glare: 1.0 },
  { key: 'uranus', en: 'Uranus', ar: 'أورانوس', goal: { en: 'the planet', ar: 'الكوكب' } },
  { key: 'neptune', en: 'Neptune', ar: 'نبتون', goal: { en: 'the planet', ar: 'الكوكب' } },
  { key: 'pluto', en: 'Pluto (dwarf)', ar: 'بلوتو (قزم)', goal: { en: 'a faint star-like dot', ar: 'نقطة خافتة تشبه النجم' } }
];

export const INSTRUMENTS = [
  { key: 'eye', mm: 7, en: 'Naked eye', ar: 'العين المجردة' },
  { key: 'bino', mm: 50, en: 'Binoculars 50 mm', ar: 'دربيل 50 مم' },
  { key: 'scope114', mm: 114, en: 'Telescope 114 mm', ar: 'تلسكوب 114 مم' },
  { key: 'scope200', mm: 200, en: 'Telescope 200 mm', ar: 'تلسكوب 200 مم' }
];

const EXTINCTION = 0.3;   // mag per airmass — dusty lowland air (clean mountain air ≈ 0.2)

function kepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// Heliocentric ecliptic J2000 position (AU)
function helio(key, T) {
  const [el, rate] = ELEMENTS[key];
  const [a, e, I, L, wbar, node] = el.map((v, k) => v + rate[k] * T);
  const w = (wbar - node) * RAD, O = node * RAD, i = I * RAD;
  const M = ((L - wbar) % 360) * RAD;
  const E = kepler(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    (sw * si) * xp + (cw * si) * yp
  ];
}

const centuries = date => (date.valueOf() / 86400000 + 2440587.5 - 2451545) / 36525;

/** Geocentric RA/Dec (deg, equinox of date), distances and V magnitude. */
export function planetEphemeris(key, date) {
  const T = centuries(date);
  const p = helio(key, T), e = helio('earth', T);
  const g = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
  const r = Math.hypot(...p), d = Math.hypot(...g), R = Math.hypot(...e);
  // ecliptic lon/lat, precessed from J2000 to the date (general precession 1.39697°/century)
  const lon = Math.atan2(g[1], g[0]) + 1.396971 * T * RAD;
  const lat = Math.asin(g[2] / d);
  const eps = (23.43929 - 0.0130042 * T) * RAD;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon));
  const phase = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)))) / RAD;
  return { ra: ((ra / RAD) + 360) % 360, dec: dec / RAD, r, d, phase, mag: MAGNITUDE[key](r, d, phase) };
}

function bodyAt(key, date, lat, lon) {
  if (key === 'moon') {
    const m = moonPosition(date, lat, lon);
    const k = moonIllumination(date);
    const phase = Math.acos(2 * k - 1) / RAD;     // lit fraction → phase angle
    // Allen's lunar phase law: full moon −12.73
    return { alt: m.alt, az: m.az, mag: -12.73 + 0.026 * phase + 4e-9 * phase ** 4, illum: k };
  }
  const eph = planetEphemeris(key, date);
  return { ...raDecToAltAz(eph.ra, eph.dec, date, lat, lon), mag: eph.mag, ra: eph.ra, dec: eph.dec };
}

const airmass = alt => 1 / (Math.sin((alt + 244 / (165 + 47 * alt ** 1.1)) * RAD));   // Pickering 2002

/** Faintest magnitude reachable with an instrument under a sky of `sqm`. */
export function limitingMag(sqm, mm) {
  const nelm = nelmFromSqm(sqm);
  return mm <= 7 ? nelm : nelm + 5 * Math.log10(mm / 7) - 0.5;
}

// The darkest natural sky on Earth is ≈ 22.0 mag/arcsec² (airglow + zodiacal light)
export const DARKEST_SKY = 22.0;

/** Sky brightness (mag/arcsec²) needed to reach a limiting magnitude; null if no real sky is that dark. */
export function sqmForLimit(lim, mm) {
  const nelm = mm <= 7 ? lim : lim - 5 * Math.log10(mm / 7) + 0.5;
  const inner = Math.pow(10, (7.93 - nelm) / 5) - 1;
  if (inner <= 0) return null;
  const sqm = 5 * (4.316 - Math.log10(inner));
  return sqm > DARKEST_SKY ? null : sqm;
}

/**
 * Tonight's plan for every body: best time (highest while the sky is dark enough),
 * rise/set above 10°, direction, brightness and what the chosen instrument will show.
 * `sky` is either a fixed sky brightness or a function date → sky brightness
 * (the AI model with the real moon and clouds at that time).
 */
export function planetsTonight({ lat, lon }, sky, mm, from = new Date()) {
  const skyAt = typeof sky === 'function' ? sky : () => sky;
  // scan the coming 24 h in 10-min steps; "dark enough" for planets = sun below −6°
  const steps = [];
  for (let k = 0; k <= 144; k++) {
    const t = new Date(from.valueOf() + k * 600000);
    if (sunPosition(t, lat, lon).alt < -6) steps.push(t);
    else if (steps.length) break;           // stop at dawn once the night has started
  }
  return BODIES.map(b => {
    let best = null, first = null, last = null;
    for (const t of steps) {
      const p = bodyAt(b.key, t, lat, lon);
      if (p.alt > 10) { first = first || t; last = t; }
      if (!best || p.alt > best.alt) best = { ...p, time: t };
    }
    if (!best) best = { ...bodyAt(b.key, from, lat, lon), time: from };
    const up = best.alt > 10;
    const ext = up ? EXTINCTION * (airmass(best.alt) - 1) : 0;
    const need = (b.faint ?? best.mag) + (b.glare ?? 0) + ext;      // faintest thing we must see
    const sqm = skyAt(best.time);                                    // real sky when you would observe
    const lim = limitingMag(sqm, mm);
    return {
      ...b, ...best, up, first, last, extinction: ext, need, sqm,
      visibleBody: up && best.mag + ext <= lim,
      visibleGoal: up && need <= lim,
      requiredSqm: sqmForLimit(need, mm)
    };
  });
}

/**
 * Light reduction (0..1) needed at the site so the AI-predicted sky reaches `targetSqm`.
 * Uses the trained model (not a formula): bisection on the artificial-light factor.
 * Returns { reduction, reachedSqm } or null if even switching every light off is not enough.
 */
export function requiredReduction(engine, inputs, targetSqm) {
  const sky = f => engine.predictWithLightFactor(inputs, f);
  if (sky(1) >= targetSqm) return { reduction: 0, reachedSqm: sky(1) };
  if (sky(0.001) < targetSqm) return null;
  let lo = 0.001, hi = 1;                          // sky(lo) ≥ target > sky(hi)
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (sky(mid) >= targetSqm) lo = mid; else hi = mid;
  }
  return { reduction: 1 - lo, reachedSqm: sky(lo) };
}
