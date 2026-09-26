// Telescope guide: where to point tonight, from the AI sky quality,
// NASA light domes per compass direction, and object positions.

import { moonIllumination, moonPosition, nextDarkness, raDecToAltAz, sunPosition } from './astro.js';

// J2000 coordinates (deg). minSqm = sky darkness needed to see it well in a small telescope.
export const CATALOG = [
  { id: 'M42', en: 'Orion Nebula', ar: 'سديم الجبار', type: 'nebula', ra: 83.82, dec: -5.39, minSqm: 17.5 },
  { id: 'M45', en: 'Pleiades', ar: 'الثريا', type: 'cluster', ra: 56.75, dec: 24.12, minSqm: 17.0 },
  { id: 'M31', en: 'Andromeda Galaxy', ar: 'مجرة المرأة المسلسلة', type: 'galaxy', ra: 10.68, dec: 41.27, minSqm: 19.5 },
  { id: 'M33', en: 'Triangulum Galaxy', ar: 'مجرة المثلث', type: 'galaxy', ra: 23.46, dec: 30.66, minSqm: 20.5 },
  { id: 'NGC869', en: 'Double Cluster', ar: 'العنقود المزدوج', type: 'cluster', ra: 35.0, dec: 57.13, minSqm: 18.5 },
  { id: 'M35', en: 'M35 Cluster', ar: 'عنقود M35', type: 'cluster', ra: 92.25, dec: 24.33, minSqm: 18.5 },
  { id: 'M44', en: 'Beehive Cluster', ar: 'عنقود خلية النحل', type: 'cluster', ra: 130.1, dec: 19.98, minSqm: 18.5 },
  { id: 'M81', en: "Bode's Galaxy", ar: 'مجرة بوده', type: 'galaxy', ra: 148.89, dec: 69.07, minSqm: 20.0 },
  { id: 'M104', en: 'Sombrero Galaxy', ar: 'مجرة القبعة', type: 'galaxy', ra: 190.0, dec: -11.62, minSqm: 20.0 },
  { id: 'Mizar', en: 'Mizar & Alcor', ar: 'المئزر والسها', type: 'double', ra: 200.98, dec: 54.93, minSqm: 16.0 },
  { id: 'M51', en: 'Whirlpool Galaxy', ar: 'المجرة الدوامية', type: 'galaxy', ra: 202.47, dec: 47.2, minSqm: 20.5 },
  { id: 'M3', en: 'M3 Globular', ar: 'العنقود الكروي M3', type: 'cluster', ra: 205.55, dec: 28.38, minSqm: 19.0 },
  { id: 'M13', en: 'Hercules Cluster', ar: 'عنقود هرقل', type: 'cluster', ra: 250.42, dec: 36.46, minSqm: 18.5 },
  { id: 'MWcore', en: 'Milky Way core', ar: 'قلب درب التبانة', type: 'milkyway', ra: 266.4, dec: -29.0, minSqm: 20.5 },
  { id: 'M8', en: 'Lagoon Nebula', ar: 'سديم البحيرة', type: 'nebula', ra: 270.9, dec: -24.38, minSqm: 19.0 },
  { id: 'M22', en: 'M22 Globular', ar: 'العنقود الكروي M22', type: 'cluster', ra: 279.1, dec: -23.9, minSqm: 18.5 },
  { id: 'M11', en: 'Wild Duck Cluster', ar: 'عنقود البطة البرية', type: 'cluster', ra: 282.77, dec: -6.27, minSqm: 19.0 },
  { id: 'M57', en: 'Ring Nebula', ar: 'السديم الحلقي', type: 'nebula', ra: 283.4, dec: 33.03, minSqm: 18.5 },
  { id: 'Albireo', en: 'Albireo (double star)', ar: 'منقار الدجاجة (نجم مزدوج)', type: 'double', ra: 292.68, dec: 27.96, minSqm: 16.0 },
  { id: 'M27', en: 'Dumbbell Nebula', ar: 'سديم الدمبل', type: 'nebula', ra: 299.9, dec: 22.72, minSqm: 19.0 }
];

export const DIRECTIONS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  ar: ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']
};

export const sectorOf = az => Math.round(((az % 360) + 360) % 360 / 45) % 8;

function separation(a1, z1, a2, z2) {
  const r = Math.PI / 180;
  const c = Math.sin(a1 * r) * Math.sin(a2 * r) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.cos((z1 - z2) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

// Observation time: now if it's already dark, otherwise when astronomical darkness starts
export function observingTime(lat, lon, now = new Date()) {
  if (sunPosition(now, lat, lon).alt < -15) return now;
  return nextDarkness(now, lat, lon) || now;
}

/**
 * @param site   {lat, lon}
 * @param sqm    AI-predicted zenith sky brightness for tonight
 * @param domes  light per compass sector (lightFeatures().directions)
 */
export function planNight({ lat, lon }, sqm, domes, date) {
  const maxDome = Math.max(...domes, 1e-9);
  const domeRel = domes.map(d => d / maxDome);
  const moon = moonPosition(date, lat, lon);
  const moonIllum = moonIllumination(date);
  const moonUp = moon.alt > 0;

  const targets = CATALOG.map(o => {
    const { alt, az } = raDecToAltAz(o.ra, o.dec, date, lat, lon);
    if (alt < 20) return null;
    // Sky gets brighter toward the horizon (airmass) and toward city light domes
    const airmass = Math.min(0.8, 0.3 * (1 / Math.sin(alt * Math.PI / 180) - 1));
    const dome = 1.2 * domeRel[sectorOf(az)] * Math.cos(alt * Math.PI / 180);
    let moonPenalty = 0;
    if (moonUp && moonIllum > 0.2) {
      const sep = separation(alt, az, moon.alt, moon.az);
      moonPenalty = moonIllum * (sep < 40 ? 1.5 : 0.6);
    }
    const effSqm = sqm - airmass - dome - moonPenalty;
    const margin = effSqm - o.minSqm;
    return { ...o, alt, az, sector: sectorOf(az), effSqm, margin, visible: margin >= 0, score: margin + alt / 60 };
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  // Best direction: darkest horizon sector (ignore the moon's sector when it's bright)
  const ranked = domeRel.map((v, i) => ({ i, v: v + (moonUp && moonIllum > 0.3 && sectorOf(moon.az) === i ? 0.5 : 0) }))
    .sort((a, b) => a.v - b.v);

  return {
    date,
    moon: { ...moon, illum: moonIllum, up: moonUp },
    darkestSector: ranked[0].i,
    brightestSector: domeRel.indexOf(1),
    domeRel,
    // absolute light per sector on a log scale (0 = pristine, 1 = city core) for display
    domeLevel: domes.map(d => Math.max(0, Math.min(1, (Math.log10(Math.max(d, 1e-6)) + 2.3) / 2.3))),
    targets,
    visible: targets.filter(t => t.visible)
  };
}
