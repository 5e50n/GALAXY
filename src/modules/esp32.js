// ESP32 Ground Station Telemetry, WebSerial & High-Fidelity Simulator
export class ESP32Station {
  constructor(onDataUpdate) {
    this.onDataUpdate = onDataUpdate;
    this.port = null;
    this.reader = null;
    this.isConnected = false;
    this.isSimulating = true;
    this.simulationTimer = null;
    this.autoSweep = false;
    this.autoSweepAngle = 0;

    // Presets for Nineveh & Mosul observation sites
    this.sites = {
      mosulCenter: {
        id: 'mosulCenter',
        nameEn: 'Mosul Downtown / Al-Majmou\'a',
        nameAr: 'مركز الموصل / حي الجامعة',
        lat: 36.3587,
        lon: 43.1307,
        alt: 223,
        baseMag: 17.00,
        bortle: 8,
        ch0: 8900,
        ch1: 950, // High LED, low IR
        radiance: 42.5, // nW/cm^2/sr
        distKm: 0.5
      },
      baashiqa: {
        id: 'baashiqa',
        nameEn: 'Ba\'ashiqa Hills',
        nameAr: 'تلال بعشيقة',
        lat: 36.4520,
        lon: 43.3480,
        alt: 385,
        baseMag: 19.60,
        bortle: 5,
        ch0: 2400,
        ch1: 420,
        radiance: 12.8,
        distKm: 22.4
      },
      badush: {
        id: 'badush',
        nameEn: 'Badush / Rabban Hormizd Ridge',
        nameAr: 'مرتفعات بادوش / ربان هرمز',
        lat: 36.5612,
        lon: 43.1120,
        alt: 512,
        baseMag: 20.75,
        bortle: 4,
        ch0: 850,
        ch1: 220,
        radiance: 3.9,
        distKm: 28.1
      },
      hatra: {
        id: 'hatra',
        nameEn: 'Al-Hatra Archaeological Biosphere',
        nameAr: 'محمية الحضر الأثرية',
        lat: 35.5890,
        lon: 42.7180,
        alt: 238,
        baseMag: 21.40,
        bortle: 3,
        ch0: 280,
        ch1: 110,
        radiance: 0.8,
        distKm: 85.0
      },
      sinjar: {
        id: 'sinjar',
        nameEn: 'Mount Sinjar Observatory Summit',
        nameAr: 'قمة جبل سنجار (مرصد مقترح)',
        lat: 36.3710,
        lon: 41.8740,
        alt: 1420,
        baseMag: 21.85,
        bortle: 2,
        ch0: 120,
        ch1: 75,
        radiance: 0.15,
        distKm: 114.0
      },
      baghdadCenter: {
        id: 'baghdadCenter',
        nameEn: 'Baghdad Downtown',
        nameAr: 'وسط بغداد',
        lat: 33.3152,
        lon: 44.3661,
        alt: 34,
        baseMag: 16.80,
        bortle: 9,
        ch0: 12500,
        ch1: 1500,
        radiance: 85.0,
        distKm: 0.5
      },
      basraCenter: {
        id: 'basraCenter',
        nameEn: 'Basra City Center',
        nameAr: 'مركز البصرة',
        lat: 30.5081,
        lon: 47.7835,
        alt: 5,
        baseMag: 17.10,
        bortle: 8,
        ch0: 9500,
        ch1: 1200,
        radiance: 55.0,
        distKm: 0.5
      },
      erbilCenter: {
        id: 'erbilCenter',
        nameEn: 'Erbil Citadel',
        nameAr: 'قلعة أربيل',
        lat: 36.1911,
        lon: 44.0092,
        alt: 420,
        baseMag: 17.50,
        bortle: 8,
        ch0: 7500,
        ch1: 850,
        radiance: 38.0,
        distKm: 0.5
      },
      rutba: {
        id: 'rutba',
        nameEn: 'Ar-Rutbah Desert',
        nameAr: 'صحراء الرطبة',
        lat: 33.0381,
        lon: 40.2806,
        alt: 650,
        baseMag: 21.90,
        bortle: 2,
        ch0: 105,
        ch1: 65,
        radiance: 0.1,
        distKm: 150.0
      },
      najafCenter: {
        id: 'najafCenter',
        nameEn: 'Najaf Center',
        nameAr: 'مركز النجف',
        lat: 31.9928,
        lon: 44.3168,
        alt: 54,
        baseMag: 17.60,
        bortle: 8,
        ch0: 6800,
        ch1: 800,
        radiance: 32.0,
        distKm: 0.5
      },
      nasiriyahCenter: {
        id: 'nasiriyahCenter',
        nameEn: 'Nasiriyah',
        nameAr: 'الناصرية',
        lat: 31.0427,
        lon: 46.2592,
        alt: 7,
        baseMag: 17.80,
        bortle: 8,
        ch0: 5500,
        ch1: 600,
        radiance: 25.0,
        distKm: 0.5
      },
      sulaymaniyahCenter: {
        id: 'sulaymaniyahCenter',
        nameEn: 'Sulaymaniyah',
        nameAr: 'السليمانية',
        lat: 35.5558,
        lon: 45.4351,
        alt: 882,
        baseMag: 17.40,
        bortle: 8,
        ch0: 8200,
        ch1: 950,
        radiance: 40.0,
        distKm: 0.5
      },
      ramadiCenter: {
        id: 'ramadiCenter',
        nameEn: 'Ramadi',
        nameAr: 'الرمادي',
        lat: 33.4243,
        lon: 43.3021,
        alt: 50,
        baseMag: 18.20,
        bortle: 7,
        ch0: 3800,
        ch1: 450,
        radiance: 15.0,
        distKm: 0.5
      },
      kirkukCenter: {
        id: 'kirkukCenter',
        nameEn: 'Kirkuk',
        nameAr: 'كركوك',
        lat: 35.4673,
        lon: 44.3855,
        alt: 350,
        baseMag: 17.50,
        bortle: 8,
        ch0: 7100,
        ch1: 850,
        radiance: 35.0,
        distKm: 0.5
      }
    };

    this.currentSiteKey = 'mosulCenter';

    // State data
    this.data = {
      lat: 36.3587,
      lon: 43.1307,
      alt: 223,
      sats: 10,
      pitch: 0.0,
      roll: 0.0,
      yaw: 180.0,
      pan: 180,
      tilt: 90, // Zenith
      ch0: 8900,
      ch1: 950,
      visibleIrRatio: 8.36,
      lampType: 'High-Efficiency White LED',
      lampTypeAr: 'مصابيح LED بيضاء حديثة',
      rawMag: 17.30,
      calibratedMag: 17.30,
      calOffset: 0.00,
      nelm: 3.32,
      bortle: 8,
      temp: 23.4,
      hum: 34.2,
      baffleFOV: 20.4, // Degrees
      lastUpdated: new Date()
    };

    this.startSimulation();
  }

  // Calculate NELM using the scientific Unihedron formula
  // NELM = 7.93 - 5 * log10(10^(4.316 - B/5) + 1)
  calculateNELM(b) {
    if (!b || b <= 0) return 0;
    const exponent = 4.316 - (b / 5.0);
    const inner = Math.pow(10, exponent) + 1.0;
    const nelm = 7.93 - 5.0 * Math.log10(inner);
    return Math.max(0, Math.min(8.0, parseFloat(nelm.toFixed(2))));
  }

  // Calculate Bortle Scale from mag/arcsec^2
  calculateBortle(mag) {
    if (mag >= 21.75) return 1; // Excellent dark sky
    if (mag >= 21.60) return 2; // Truly dark site
    if (mag >= 21.35) return 3; // Rural sky
    if (mag >= 20.40) return 4; // Rural/suburban transition
    if (mag >= 19.10) return 5; // Suburban sky
    if (mag >= 18.00) return 6; // Bright suburban sky
    if (mag >= 17.50) return 7; // Suburban/urban transition
    if (mag >= 16.50) return 8; // City sky
    return 9; // Inner-city sky
  }

  // Classify lighting type from Visible_IR_Ratio = (CH0 - CH1) / CH1
  classifyLampType(ratio) {
    if (ratio < 2.0) {
      return {
        en: 'High-Pressure Sodium (HPS)',
        ar: 'صوديوم عالي الضغط (HPS تقليدي)',
        color: '#ff9800',
        ledPercent: 15
      };
    } else if (ratio < 5.0) {
      return {
        en: 'Mixed / Transitioning Lighting',
        ar: 'إنارة مختلطة / قيد التحول',
        color: '#ffeb3b',
        ledPercent: 55
      };
    } else {
      return {
        en: 'High-Efficiency White LED',
        ar: 'مصابيح LED بيضاء حديثة',
        color: '#00e5ff',
        ledPercent: 92
      };
    }
  }

  setSite(siteKey) {
    if (!this.sites[siteKey]) return;
    this.currentSiteKey = siteKey;
    const site = this.sites[siteKey];

    this.data.lat = site.lat;
    this.data.lon = site.lon;
    this.data.alt = site.alt;
    this.data.baseMag = site.baseMag;
    this.data.rawMag = site.baseMag;
    this.data.bortle = site.bortle;
    this.data.ch0 = site.ch0;
    this.data.ch1 = site.ch1;
    this.updateComputedValues();
  }

  setServoAngles(pan, tilt) {
    this.data.pan = parseInt(pan, 10);
    this.data.tilt = parseInt(tilt, 10);

    // Physical effect of viewing angle on sky darkness:
    // Looking at Zenith (90°) sees the thinnest air column (darkest).
    // Looking at lower elevation (45°, 60°) passes through more atmosphere and city skyglow.
    const tiltPenalty = (90 - this.data.tilt) * 0.018; // approx 0.8 mag brighter at 45°
    const site = this.sites[this.currentSiteKey];
    this.data.rawMag = parseFloat((site.baseMag - tiltPenalty).toFixed(2));
    this.updateComputedValues();
  }

  setCalibrationOffset(offset) {
    this.data.calOffset = parseFloat(offset);
    this.data.calibratedMag = parseFloat((this.data.rawMag + this.data.calOffset).toFixed(2));
    this.data.nelm = this.calculateNELM(this.data.calibratedMag);
    this.data.bortle = this.calculateBortle(this.data.calibratedMag);
    if (this.onDataUpdate) this.onDataUpdate(this.data);
  }

  updateComputedValues() {
    // Ratio = (CH0 - CH1) / CH1
    const ch0 = Math.max(1, this.data.ch0);
    const ch1 = Math.max(1, this.data.ch1);
    this.data.visibleIrRatio = parseFloat(((ch0 - ch1) / ch1).toFixed(2));

    const lamp = this.classifyLampType(this.data.visibleIrRatio);
    this.data.lampType = lamp.en;
    this.data.lampTypeAr = lamp.ar;
    this.data.lampColor = lamp.color;
    this.data.ledPercent = lamp.ledPercent;

    this.data.calibratedMag = parseFloat((this.data.rawMag + this.data.calOffset).toFixed(2));
    this.data.nelm = this.calculateNELM(this.data.calibratedMag);
    this.data.bortle = this.calculateBortle(this.data.calibratedMag);
    this.data.lastUpdated = new Date();

    if (this.onDataUpdate) this.onDataUpdate(this.data);
  }

  startSimulation() {
    this.isSimulating = true;
    if (this.simulationTimer) clearInterval(this.simulationTimer);

    this.simulationTimer = setInterval(() => {
      if (this.isConnected) return; // Do not overwrite if real device is streaming

      // Subtle natural telemetry fluctuations
      const noise = (Math.random() - 0.5) * 0.06;
      const site = this.sites[this.currentSiteKey];
      const tiltPenalty = (90 - this.data.tilt) * 0.018;

      this.data.rawMag = parseFloat((site.baseMag - tiltPenalty + noise).toFixed(2));
      this.data.ch0 = Math.round(site.ch0 * (1 + (Math.random() - 0.5) * 0.04));
      this.data.ch1 = Math.round(site.ch1 * (1 + (Math.random() - 0.5) * 0.04));
      
      // Slight IMU drift/settle
      this.data.pitch = parseFloat(((Math.random() - 0.5) * 0.4).toFixed(1));
      this.data.roll = parseFloat(((Math.random() - 0.5) * 0.3).toFixed(1));
      this.data.yaw = parseFloat((this.data.pan + (Math.random() - 0.5) * 0.2).toFixed(1));

      // Automated sky sweep mode
      if (this.autoSweep) {
        this.autoSweepAngle = (this.autoSweepAngle + 4) % 360;
        this.data.pan = this.autoSweepAngle;
      }

      this.updateComputedValues();
    }, 1200);
  }

  toggleAutoSweep(enabled) {
    this.autoSweep = enabled;
  }

  // WebSerial API: Direct connection to physical ESP32 via USB Serial
  async connectWebSerial() {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser. Please use Google Chrome, Edge, or Opera.');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });
      this.isConnected = true;
      this.isSimulating = false;

      const decoder = new TextDecoderStream();
      const inputDone = this.port.readable.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      this.reader = inputStream.getReader();

      let buffer = '';
      const readLoop = async () => {
        while (this.isConnected) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                  const json = JSON.parse(trimmed);
                  this.handleRealDevicePacket(json);
                } catch (e) {
                  console.warn('Invalid JSON packet from ESP32:', trimmed);
                }
              }
            }
          }
        }
      };

      readLoop();
      return true;
    } catch (err) {
      console.error('Serial connection error:', err);
      this.disconnectSerial();
      throw err;
    }
  }

  handleRealDevicePacket(pkt) {
    if (pkt.lat !== undefined) this.data.lat = parseFloat(pkt.lat);
    if (pkt.lon !== undefined) this.data.lon = parseFloat(pkt.lon);
    if (pkt.alt !== undefined) this.data.alt = parseFloat(pkt.alt);
    if (pkt.sats !== undefined) this.data.sats = parseInt(pkt.sats, 10);
    if (pkt.pitch !== undefined) this.data.pitch = parseFloat(pkt.pitch);
    if (pkt.roll !== undefined) this.data.roll = parseFloat(pkt.roll);
    if (pkt.yaw !== undefined) this.data.yaw = parseFloat(pkt.yaw);
    if (pkt.pan !== undefined) this.data.pan = parseInt(pkt.pan, 10);
    if (pkt.tilt !== undefined) this.data.tilt = parseInt(pkt.tilt, 10);
    if (pkt.ch0 !== undefined) this.data.ch0 = parseInt(pkt.ch0, 10);
    if (pkt.ch1 !== undefined) this.data.ch1 = parseInt(pkt.ch1, 10);
    if (pkt.mag !== undefined) this.data.rawMag = parseFloat(pkt.mag);
    if (pkt.temp !== undefined) this.data.temp = parseFloat(pkt.temp);
    if (pkt.hum !== undefined) this.data.hum = parseFloat(pkt.hum);

    this.updateComputedValues();
  }

  async disconnectSerial() {
    this.isConnected = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
      this.reader = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }
    this.startSimulation();
  }
}
