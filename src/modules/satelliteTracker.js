import * as satellite from 'satellite.js';

// Only satellites with fresh TLEs (epoch Sept 2026). Stale TLEs drift by 1000s of km.
// Refresh from https://celestrak.org/NORAD/elements/ before the demo if needed.
export const SAT_DATA = [
  {
    id: 'suomi-npp', name: 'NASA Suomi-NPP (VIIRS)',
    tle1: '1 37849U 11061A   26268.28916861  .00000051  00000+0  45208-4 0  9993',
    tle2: '2 37849  98.8019 208.5053 0002637  55.9766 304.1660 14.19535008772649',
    color: '#00d4ff', icon: '🛰️'
  },
  {
    id: 'noaa-20', name: 'NOAA-20 (JPSS-1)',
    tle1: '1 43013U 17073A   26268.23239340  .00000055  00000+0  47248-4 0  9997',
    tle2: '2 43013  98.7831 206.8268 0001158  38.4803 321.6455 14.19527610458663',
    color: '#00e676', icon: '🛰️'
  },
  {
    id: 'iss', name: 'ISS (International Space Station)',
    tle1: '1 25544U 98067A   26268.17397659  .00011139  00000+0  20797-3 0  9993',
    tle2: '2 25544  51.6316 165.2379 0004773 179.0895 181.0103 15.49282084587251',
    color: '#ffab00', icon: '🚀'
  }
];

export class SatelliteTracker {
  constructor() {
    const satLib = satellite;
    this.satLib = satLib;
    this.satellites = SAT_DATA.map(s => {
      try {
        return {
          ...s,
          satrec: satLib.twoline2satrec ? satLib.twoline2satrec(s.tle1, s.tle2) : null
        };
      } catch (e) {
        return { ...s, satrec: null };
      }
    });
  }

  // Get current position in Lat/Lon for a specific satellite
  getCurrentPosition(satId, date = new Date()) {
    const sat = this.satellites.find(s => s.id === satId);
    if (!sat || !sat.satrec) return null;

    try {
      const positionAndVelocity = this.satLib.propagate(sat.satrec, date);
      const positionEci = positionAndVelocity ? positionAndVelocity.position : null;
      
      if (!positionEci) return null;

      const gmst = this.satLib.gstime(date);
      const positionGd = this.satLib.eciToGeodetic(positionEci, gmst);
      
      const longitude = this.satLib.degreesLong(positionGd.longitude);
      const latitude = this.satLib.degreesLat(positionGd.latitude);
      const height = positionGd.height; // in km

      return { lat: latitude, lon: longitude, height };
    } catch (err) {
      return null;
    }
  }

  // Get an array of points for the orbit track
  getOrbitTrack(satId, date = new Date(), minutesPast = 90, minutesFuture = 90, stepMinutes = 2) {
    const track = [];
    const msPerMinute = 60000;
    
    for (let i = -minutesPast; i <= minutesFuture; i += stepMinutes) {
      const stepDate = new Date(date.getTime() + i * msPerMinute);
      const pos = this.getCurrentPosition(satId, stepDate);
      if (pos) {
        track.push([pos.lat, pos.lon]);
      }
    }
    
    return track;
  }
}
