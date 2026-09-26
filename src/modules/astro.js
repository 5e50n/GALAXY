// Sun & Moon position / illumination (SunCalc algorithm).
// Mirrors ml/orbit_ml/astro.py — keep both in sync.

const RAD = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397;

const toDays = date => date.valueOf() / 86400000 - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
export const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { ra: rightAscension(L, 0), dec: declination(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

function position(coords, date, lat, lon) {
  const d = toDays(date);
  const c = coords(d);
  const H = siderealTime(d, RAD * -lon) - c.ra;
  const phi = RAD * lat;
  // azimuth measured from north, clockwise (degrees)
  return { alt: altitude(H, phi, c.dec) / RAD, az: (azimuth(H, phi, c.dec) / RAD + 180) % 360 };
}

export const sunPosition = (date, lat, lon) => position(sunCoords, date, lat, lon);
export const moonPosition = (date, lat, lon) => position(moonCoords, date, lat, lon);

export function moonIllumination(date) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.min(1, Math.max(-1,
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra))));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  return (1 + Math.cos(inc)) / 2;
}

// Alt/az of a fixed sky object (RA/Dec in degrees) — used by the telescope guide
export function raDecToAltAz(raDeg, decDeg, date, lat, lon) {
  const d = toDays(date);
  const H = siderealTime(d, RAD * -lon) - raDeg * RAD;
  const phi = RAD * lat;
  const dec = decDeg * RAD;
  return { alt: altitude(H, phi, dec) / RAD, az: (azimuth(H, phi, dec) / RAD + 180) % 360 };
}

// Next time (after `from`) when the sun drops below -18° (astronomical darkness)
export function nextDarkness(from, lat, lon) {
  const t = new Date(from);
  for (let i = 0; i < 48 * 6; i++) {
    if (sunPosition(t, lat, lon).alt < -18) return new Date(t);
    t.setMinutes(t.getMinutes() + 10);
  }
  return null;
}
