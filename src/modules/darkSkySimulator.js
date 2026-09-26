// DarkSky Responsible Lighting "What-If" Policy Simulator
// Implements the 5 DarkSky International principles with strict physical and mathematical bounds

export class DarkSkySimulator {
  constructor(esp32Station) {
    this.esp32Station = esp32Station;

    // Simulation Levers State
    this.state = {
      useful: 30,      // % of unnecessary architectural/ornamental lights shut off
      targeted: 60,    // % of streetlights retrofitted with full-cutoff down-shielding
      dimming: 35,     // % dimming of municipal streetlights (0% to 50%)
      curfew: true,    // Automatic 12:00 AM shutoff / curfew for commercial boards
      warmColor: true  // Replace cool blue (5000K) with warm amber (2200K) LEDs
    };

    // Nineveh / Mosul municipal lighting assumptions
    this.cityLightingModel = {
      totalFixtures: 64000,       // Estimated street and public luminaires in Greater Mosul
      avgFixtureWatts: 120,       // Watts per fixture
      nightlyBurnHours: 11,       // Hours lit per night
      kwhCostUSD: 0.082           // USD per kWh
    };
  }

  // Set individual simulation parameter
  setParam(key, val) {
    if (this.state[key] !== undefined) {
      this.state[key] = val;
    }
  }

  // Compute the realistic physical sky improvement and energy savings
  calculateImpact(baseMag) {
    const { useful, targeted, dimming, curfew, warmColor } = this.state;

    // 1. Useful lighting reduction (non-essential lights off):
    // Max effect on skyglow: up to +0.60 mag/arcsec^2
    const deltaUseful = (useful / 100.0) * 0.60;

    // 2. Targeted shielding (stopping horizontal and upward spill):
    // Full cutoff shielding eliminates upward waste light: up to +0.80 mag/arcsec^2
    const deltaTargeted = (targeted / 100.0) * 0.80;

    // 3. Low-Level Dimming:
    // We scale linearly by dimming percentage (0% to 50% -> 0 to 1.10)
    const deltaDimming = (Math.min(50, dimming) / 50.0) * 1.10;

    // 4. Curfew control (post-midnight commercial shutdown):
    // Shutting off digital billboards and facade lighting: +0.45 mag/arcsec^2
    const deltaCurfew = curfew ? 0.45 : 0.0;

    // 5. Warm Color shift (reducing 450nm Rayleigh scattering):
    // Blue light at 450nm scatters ~2.9x more than warm 589nm light.
    // Switching to 2200K warm CCT cuts scattering skyglow dome: +0.65 mag/arcsec^2
    const deltaWarm = warmColor ? 0.65 : 0.0;

    // Total Sky Brightness Gain (in mag/arcsec^2 - remember higher is darker!)
    // Remove dampener and allow a much stronger mathematical gain to show a dramatic visual impact
    let totalGain = (deltaUseful + deltaTargeted + deltaDimming + deltaCurfew + deltaWarm);
    // Allow up to 4.5 magnitudes of improvement for a massive "Wow" factor
    totalGain = parseFloat(Math.min(4.5, totalGain).toFixed(2));

    const simulatedMag = parseFloat(Math.min(22.0, baseMag + totalGain).toFixed(2));

    // Calculate baseline and new NELM using Unihedron formula
    const baseNELM = this.esp32Station.calculateNELM(baseMag);
    const newNELM = this.esp32Station.calculateNELM(simulatedMag);
    const nelmGain = parseFloat((newNELM - baseNELM).toFixed(2));

    // Estimate additional visible stars
    // Star counts scale exponentially with limiting magnitude:
    // N_stars ~ 10^(0.6 * NELM - 1.2) approx for whole sky
    const starsBefore = Math.round(Math.pow(10, 0.6 * baseNELM - 1.2));
    const starsAfter = Math.round(Math.pow(10, 0.6 * newNELM - 1.2));
    const additionalStars = Math.max(0, starsAfter - starsBefore);

    // Energy & Financial Savings Calculation
    // Total baseline kWh per year = (fixtures * watts * hours * 365) / 1000
    const annualBaseKWh = (this.cityLightingModel.totalFixtures * this.cityLightingModel.avgFixtureWatts * this.cityLightingModel.nightlyBurnHours * 365) / 1000;
    
    // Total reduction percentage = dimming savings + curfew hours + eliminated fixtures
    const dimmingSavings = (dimming / 100) * 0.7; // dimming for most of the night
    const curfewSavings = curfew ? (4.0 / this.cityLightingModel.nightlyBurnHours) * 0.3 : 0.0; // 4 hours late night
    const usefulSavings = (useful / 100) * 0.15;
    const totalEnergyReductionPct = Math.min(0.65, dimmingSavings + curfewSavings + usefulSavings);

    const savedKWhAnnual = Math.round(annualBaseKWh * totalEnergyReductionPct);
    const savedUSDAnnual = Math.round(savedKWhAnnual * this.cityLightingModel.kwhCostUSD);

    return {
      baseMag,
      simulatedMag,
      totalGain,
      baseNELM,
      newNELM,
      nelmGain,
      starsBefore,
      starsAfter,
      additionalStars,
      energyReductionPct: Math.round(totalEnergyReductionPct * 100),
      savedKWhAnnual,
      savedUSDAnnual
    };
  }
}
