// Live compass from the phone's orientation sensor.
//   iOS Safari : deviceorientation + webkitCompassHeading (needs a tap → requestPermission)
//   Android    : deviceorientationabsolute, heading = 360 − alpha
// Sensors give MAGNETIC north; we add the local declination to get TRUE north,
// which is what the sky positions use. Works only on devices with a magnetometer
// and on https:// or localhost.

// Magnetic declination (°, east positive) — WMM 2025 values for Iraq are ≈ +3.5° (Basra) … +5.7° (Mosul).
export function declination(lat) {
  if (lat > 29 && lat < 38) return 3.5 + (lat - 30.5) * 0.3;
  return 0;
}

const norm = a => ((a % 360) + 360) % 360;
/** Signed turn from heading to target, in (−180, 180]; positive = turn right (clockwise). */
export const turn = (heading, target) => { const d = norm(target - heading); return d > 180 ? d - 360 : d; };

export class LiveCompass {
  constructor(onHeading) {
    this.onHeading = onHeading;
    this.decl = 0;
    this.heading = null;
    this.handler = null;
  }

  /** @returns 'ok' | 'denied' | 'unsupported' | 'nosensor' */
  async start(decl = 0) {
    this.decl = decl;
    if (!('DeviceOrientationEvent' in window)) return 'unsupported';
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return 'denied';
      } catch { return 'denied'; }
    }
    this.stop();
    let got = false;
    this.handler = e => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
      else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') h = 360 - e.alpha;
      if (h == null) return;
      got = true;
      h = norm(h + (screen.orientation?.angle || 0) + this.decl);
      // smooth on the circle (vector average) so the needle does not jitter
      if (this.heading == null) this.heading = h;
      else {
        const r = Math.PI / 180, k = 0.25;
        const x = (1 - k) * Math.cos(this.heading * r) + k * Math.cos(h * r);
        const y = (1 - k) * Math.sin(this.heading * r) + k * Math.sin(h * r);
        this.heading = norm(Math.atan2(y, x) / r);
      }
      this.onHeading(this.heading);
    };
    this.event = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.event, this.handler);
    // no reading within 2.5 s → this device has no compass sensor (e.g. a laptop)
    await new Promise(r => setTimeout(r, 2500));
    if (!got) { this.stop(); return 'nosensor'; }
    return 'ok';
  }

  stop() {
    if (this.handler) window.removeEventListener(this.event, this.handler);
    this.handler = null;
    this.heading = null;
  }
}
