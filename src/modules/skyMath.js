// Sky-quality conversions. Mirrors ml/orbit_ml/features.py.

// Naked-eye limiting magnitude from sky brightness (Unihedron formula)
export function nelmFromSqm(b) {
  if (!b || b <= 0) return 0;
  const nelm = 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - b / 5) + 1);
  return Math.max(0, Math.min(8, nelm));
}

// Bortle class from zenith sky brightness (mag/arcsec²)
export function bortleFromSqm(mag) {
  if (mag >= 21.75) return 1;
  if (mag >= 21.60) return 2;
  if (mag >= 21.35) return 3;
  if (mag >= 20.40) return 4;
  if (mag >= 19.10) return 5;
  if (mag >= 18.00) return 6;
  if (mag >= 17.50) return 7;
  if (mag >= 16.50) return 8;
  return 9;
}

// Stars visible to the naked eye in the whole visible hemisphere.
// Cumulative star counts: full sky N(<m) ≈ 10^(0.49 m + 0.76)
// (≈170 stars brighter than mag 3, ≈5000 brighter than mag 6); half is above the horizon.
export function visibleStars(nelm) {
  return Math.round(0.5 * Math.pow(10, 0.49 * nelm + 0.76));
}

export const BORTLE_NAMES = {
  en: { 1: 'Pristine', 2: 'Truly dark', 3: 'Rural', 4: 'Rural/suburban', 5: 'Suburban', 6: 'Bright suburban', 7: 'Suburban/urban', 8: 'City sky', 9: 'Inner city' },
  ar: { 1: 'مظلمة تماماً', 2: 'مظلمة حقاً', 3: 'ريفية', 4: 'ريفية/ضواحي', 5: 'ضواحي', 6: 'ضواحي ساطعة', 7: 'ضواحي/مدينة', 8: 'سماء مدينة', 9: 'وسط مدينة' }
};
