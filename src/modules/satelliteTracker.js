import * as satellite from 'satellite.js';

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
  },
  {
    id: 'terra', name: 'Terra (EOS AM-1)',
    tle1: '1 25994U 99068A   23267.93043812  .00000854  00000+0  22384-3 0  9999',
    tle2: '2 25994  98.1258 296.8837 0000555  64.3807 307.7289 14.57140882258953',
    color: '#b388ff', icon: '🛰️'
  },
  {
    id: 'aqua', name: 'Aqua (EOS PM-1)',
    tle1: '1 27424U 02022A   23267.87679374  .00001229  00000+0  29375-3 0  9994',
    tle2: '2 27424  98.2435 304.7454 0001712  85.4913 286.9537 14.57106037125345',
    color: '#8c9eff', icon: '🛰️'
  },
  {
    id: 'landsat-8', name: 'Landsat 8',
    tle1: '1 39084U 13008A   23268.04690022  .00001550  00000+0  34421-3 0  9997',
    tle2: '2 39084  98.1764 309.8406 0001306  89.7027 270.4357 14.57117173558661',
    color: '#1de9b6', icon: '🛰️'
  },
  {
    id: 'sentinel-2a', name: 'Sentinel-2A',
    tle1: '1 40697U 15028A   23267.92389146  .00000213  00000+0  10682-3 0  9994',
    tle2: '2 40697  98.5997 296.2238 0001389  98.0519 262.0833 14.30825313430588',
    color: '#ffd740', icon: '🛰️'
  },
  {
    id: 'hubble', name: 'Hubble Space Telescope',
    tle1: '1 20580U 90037B   23267.87974558  .00004514  00000+0  22359-3 0  9993',
    tle2: '2 20580  28.4690 128.9839 0002273 189.6645 151.7248 15.08836526435345',
    color: '#ff4081', icon: '🔭'
  },
  {
    id: 'starlink-1', name: 'Starlink-1011',
    tle1: '1 44714U 19074B   23268.12345678  .00005000  00000-0  50000-4 0  9998',
    tle2: '2 44714  53.0533 130.4567 0001234  10.1234 350.1234 15.06012345678901',
    color: '#cfd8dc', icon: '📡'
  },
  {
    id: 'starlink-2', name: 'Starlink-1432',
    tle1: '1 45663U 20035N   23268.22345678  .00005000  00000-0  50000-4 0  9995',
    tle2: '2 45663  53.0544 140.4567 0001234  20.1234 340.1234 15.06012345678901',
    color: '#cfd8dc', icon: '📡'
  },
  {
    id: 'starlink-3', name: 'Starlink-1521',
    tle1: '1 46027U 20055F   23268.32345678  .00005000  00000-0  50000-4 0  9992',
    tle2: '2 46027  53.0555 150.4567 0001234  30.1234 330.1234 15.06012345678901',
    color: '#cfd8dc', icon: '📡'
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
