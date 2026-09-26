// NASA map layers + known false-positive light sources.

export const GIBS_BLACK_MARBLE = {
  url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
  attribution: 'NASA GIBS · VIIRS Black Marble',
  maxNativeZoom: 8,
  maxZoom: 19
};

// Oil-field gas flares in south Nineveh look like "cities" to VIIRS.
// They are industrial flames, not municipal lighting, so they are flagged on the map.
export const GAS_FLARES = [
  { nameEn: 'Qayyarah oil field flares', nameAr: 'شعلات حقل القيارة', lat: 35.801, lon: 43.272, radiusM: 9000 },
  { nameEn: 'Najmah oil field flares', nameAr: 'شعلات حقل النجمة', lat: 35.912, lon: 43.148, radiusM: 6500 }
];

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function gasFlareAt(lat, lon) {
  return GAS_FLARES.find(f => haversineKm(lat, lon, f.lat, f.lon) <= f.radiusM / 1000) || null;
}

// Elevation for any clicked point (Open-Meteo, free, no key)
export async function fetchElevation(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    const j = await r.json();
    return j.elevation?.[0] ?? 300;
  } catch {
    return 300;
  }
}

// Hourly cloud-cover forecast (Open-Meteo), cached 30 min per place
const cloudCache = new Map();
export async function fetchCloudForecast(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cloudCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60000) return hit.data;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover&past_days=1&forecast_days=2&timezone=UTC`);
    const j = await r.json();
    const data = { time: j.hourly.time, cloud: j.hourly.cloud_cover };
    cloudCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/** Cloud fraction (0..1) at a given time from a forecast, or null. */
export function cloudAt(forecast, date) {
  if (!forecast) return null;
  const i = forecast.time.findIndex(t => t.startsWith(date.toISOString().slice(0, 13)));
  return i >= 0 && forecast.cloud[i] != null ? forecast.cloud[i] / 100 : null;
}

// Cloud cover at one time (kept for the export tool)
export async function fetchCloudCover(lat, lon, date) {
  return cloudAt(await fetchCloudForecast(lat, lon), date);
}
