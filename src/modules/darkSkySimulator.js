// DarkSky "What-If" simulator — DarkSky International's 5 lighting principles.
// Each policy reduces the artificial light that reaches the sky by a factor;
// the reduced light is fed back into the trained ORBIT AI model, so the
// predicted sky comes from the model, not from a hand-made formula.
//
// Light-reduction coefficients are stated assumptions (shown on the page):
//   non-essential lights : decorative/facade/ad lighting ≈ 20 % of city light
//   full-cutoff shielding: removes direct up-light ≈ 35 % of skyglow at 100 % retrofit
//   dimming              : light scales 1:1 with dimming (max 50 %)
//   midnight curfew      : commercial lighting ≈ 15 % of light after midnight
//   2200 K amber LEDs    : ≈ 30 % less skyglow than 5000 K (less Rayleigh scatter of blue)

import { nelmFromSqm, visibleStars } from './skyMath.js';

export const ASSUMPTIONS = {
  decorativeShare: 0.20,
  shieldingCut: 0.35,
  curfewShare: 0.15,
  warmCut: 0.30
};

const CITY_LIGHTING = {
  fixtures: 64000,     // estimated public luminaires in Greater Mosul
  watts: 120,
  hoursPerNight: 11,
  usdPerKwh: 0.082
};

export class DarkSkySimulator {
  constructor() {
    this.state = { useful: 30, targeted: 60, dimming: 35, curfew: true, warmColor: true };
  }

  setParam(key, val) {
    if (key in this.state) this.state[key] = val;
  }

  lightFactor() {
    const { useful, targeted, dimming, curfew, warmColor } = this.state;
    const a = ASSUMPTIONS;
    return (1 - a.decorativeShare * useful / 100) *
      (1 - a.shieldingCut * targeted / 100) *
      (1 - Math.min(50, dimming) / 100) *
      (curfew ? 1 - a.curfewShare : 1) *
      (warmColor ? 1 - a.warmCut : 1);
  }

  // model: SkyModel, inputs: SkyModel.buildInputs() result for the site
  calculateImpact(model, inputs) {
    const factor = this.lightFactor();
    const baseMag = model.predictWithLightFactor(inputs, 1);
    const simulatedMag = model.predictWithLightFactor(inputs, factor);
    const baseNELM = nelmFromSqm(baseMag);
    const newNELM = nelmFromSqm(simulatedMag);
    const starsBefore = visibleStars(baseNELM);
    const starsAfter = visibleStars(newNELM);

    const { useful, dimming, curfew } = this.state;
    const energyPct = Math.min(0.65,
      (dimming / 100) * 0.7 + (curfew ? (4 / CITY_LIGHTING.hoursPerNight) * 0.3 : 0) + (useful / 100) * 0.15);
    const annualKWh = CITY_LIGHTING.fixtures * CITY_LIGHTING.watts * CITY_LIGHTING.hoursPerNight * 365 / 1000;
    const savedKWh = Math.round(annualKWh * energyPct);

    return {
      lightFactor: factor,
      baseMag,
      simulatedMag,
      totalGain: simulatedMag - baseMag,
      baseNELM,
      newNELM,
      starsBefore,
      starsAfter,
      additionalStars: Math.max(0, starsAfter - starsBefore),
      energyReductionPct: Math.round(energyPct * 100),
      savedKWhAnnual: savedKWh,
      savedUSDAnnual: Math.round(savedKWh * CITY_LIGHTING.usdPerKwh)
    };
  }
}
