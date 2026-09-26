// Leaflet Interactive Geospatial Map for Nineveh / Mosul
// Integrates NASA GIBS WMTS tiles, Ground Station tracking, and Oil Flare Masking

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export class ObservatoryMap {
  constructor(mapContainerId, onSiteSelect) {
    this.containerId = mapContainerId;
    this.onSiteSelect = onSiteSelect;
    this.map = null;
    this.activeSiteKey = 'mosulCenter';
    this.markers = {};
    this.flareLayers = [];
    this.deviceMarker = null;
    this.currentTileLayer = null;

    this.initMap();
  }

  initMap() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Center on Nineveh Governorate (Mosul)
    this.map = L.map(this.containerId, {
      center: [36.3487, 43.1307],
      zoom: 9,
      minZoom: 7,
      maxZoom: 16,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Default Basemap: Dark Carto Matter (Deep Space vibe)
    this.baseLayers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &copy; Earthstar Geographics',
        maxZoom: 18
      }),
      nasaBlackMarble: L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2024-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', {
        attribution: 'NASA GIBS / Black Marble (VIIRS DNB)',
        maxZoom: 8,
        opacity: 0.85
      })
    };

    this.baseLayers.dark.addTo(this.map);
    this.currentTileLayer = 'dark';

    // Add Nineveh Sites
    this.addObservationSites();

    // Add South Nineveh Oil Flare Mask (Qayyarah / Najmah)
    this.addOilFlareMask();

    // Add Live Device Marker
    this.addDeviceMarker();
  }

  setTileLayer(layerKey) {
    if (this.baseLayers[this.currentTileLayer]) {
      this.map.removeLayer(this.baseLayers[this.currentTileLayer]);
    }
    if (this.baseLayers[layerKey]) {
      this.baseLayers[layerKey].addTo(this.map);
      this.currentTileLayer = layerKey;
    }
  }

  addObservationSites() {
    const sites = [
      {
        key: 'sinjar',
        nameEn: 'Mount Sinjar Observatory Ridge',
        nameAr: 'قمة جبل سنجار (مرصد مقترح)',
        coords: [36.3710, 41.8740],
        bortle: 2,
        mag: '21.85',
        type: 'Pristine Dark Sky',
        color: '#00ff88'
      },
      {
        key: 'hatra',
        nameEn: 'Al-Hatra Archaeological Biosphere',
        nameAr: 'محمية الحضر الأثرية',
        coords: [35.5890, 42.7180],
        bortle: 3,
        mag: '21.40',
        type: 'Rural Dark Sky',
        color: '#00e5ff'
      },
      {
        key: 'badush',
        nameEn: 'Badush / Rabban Hormizd Ridge',
        nameAr: 'مرتفعات بادوش / ربان هرمز',
        coords: [36.5612, 43.1120],
        bortle: 4,
        mag: '20.75',
        type: 'Rural / Suburban Transition',
        color: '#76ff03'
      },
      {
        key: 'baashiqa',
        nameEn: 'Ba\'ashiqa Hills',
        nameAr: 'تلال بعشيقة',
        coords: [36.4520, 43.3480],
        bortle: 5,
        mag: '19.60',
        type: 'Suburban Skyglow',
        color: '#ffc107'
      },
      {
        key: 'mosulCenter',
        nameEn: 'Mosul Downtown / Al-Majmou\'a',
        nameAr: 'مركز الموصل / حي الجامعة',
        coords: [36.3587, 43.1307],
        bortle: 8,
        mag: '17.30',
        type: 'Urban Severe Light Pollution',
        color: '#ff3d00'
      }
    ];

    sites.forEach(site => {
      const icon = L.divIcon({
        className: 'custom-site-icon',
        html: `
          <div class="site-marker-pin" style="--site-color: ${site.color}">
            <div class="site-marker-pulse"></div>
            <div class="site-marker-dot"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker(site.coords, { icon }).addTo(this.map);
      marker.bindPopup(`
        <div class="map-site-popup">
          <h4>${site.nameEn}</h4>
          <p class="arabic-sub">${site.nameAr}</p>
          <div class="popup-meta">
            <span class="badge" style="background:${site.color}22; color:${site.color}; border: 1px solid ${site.color}">Bortle Class ${site.bortle}</span>
            <span class="mag-stat">${site.mag} mag/arcsec²</span>
          </div>
          <p class="site-desc">${site.type}</p>
          <button class="popup-select-btn" data-site="${site.key}">Select for Ground Telemetry</button>
        </div>
      `);

      marker.on('click', () => {
        if (this.onSiteSelect) this.onSiteSelect(site.key);
      });

      this.markers[site.key] = marker;
    });

    // Delegate popup button clicks
    this.map.on('popupopen', e => {
      const btn = e.popup._contentNode.querySelector('.popup-select-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const siteKey = btn.getAttribute('data-site');
          if (this.onSiteSelect) this.onSiteSelect(siteKey);
          this.map.closePopup();
        });
      }
    });
  }

  addOilFlareMask() {
    const flareZones = [
      {
        nameEn: 'Qayyarah Oil Field & Refinery Gas Flares',
        nameAr: 'حقل ومصفى القيارة (شعلات الغاز المصاحب)',
        lat: 35.8010,
        lon: 43.2720,
        radius: 9000
      },
      {
        nameEn: 'Najmah Oil Extraction Flaring Zone',
        nameAr: 'حقل النجمة النفطي (لهب الغاز)',
        lat: 35.9120,
        lon: 43.1480,
        radius: 6500
      }
    ];

    flareZones.forEach(zone => {
      const circle = L.circle([zone.lat, zone.lon], {
        radius: zone.radius,
        color: '#ff1744',
        weight: 1.5,
        dashArray: '5, 5',
        fillColor: '#ff1744',
        fillOpacity: 0.16
      }).addTo(this.map);

      circle.bindTooltip(`
        <div class="flare-tooltip">
          <strong>⚠️ ${zone.nameEn}</strong><br/>
          <span>${zone.nameAr}</span><br/>
          <em>Industrial combustion masked from municipal model</em>
        </div>
      `, { sticky: true });

      this.flareLayers.push(circle);
    });
  }

  toggleFlareMask(enabled) {
    this.flareLayers.forEach(layer => {
      if (enabled) {
        if (!this.map.hasLayer(layer)) layer.addTo(this.map);
      } else {
        if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
      }
    });
  }

  addDeviceMarker() {
    const deviceIcon = L.divIcon({
      className: 'live-device-marker',
      html: `
        <div class="esp32-hud-marker">
          <div class="radar-ping"></div>
          <div class="crosshair-icon">🛰️</div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    this.deviceMarker = L.marker([36.3587, 43.1307], { icon: deviceIcon, zIndexOffset: 1000 }).addTo(this.map);
  }

  updateDevicePosition(lat, lon, mag, pan) {
    if (this.deviceMarker) {
      this.deviceMarker.setLatLng([lat, lon]);
    }
  }

  flyToSite(siteKey) {
    const marker = this.markers[siteKey];
    if (marker) {
      this.map.flyTo(marker.getLatLng(), 11, { duration: 1.2 });
      marker.openPopup();
    }
  }
}
