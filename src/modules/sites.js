// Observation sites in Nineveh & Iraq. Sky quality is NOT stored here —
// it is predicted live by the ORBIT AI model from NASA data.

export const SITES = {
  mosulCenter: { nameEn: 'Mosul Downtown', nameAr: 'مركز الموصل', lat: 36.3587, lon: 43.1307, alt: 223, group: 'nineveh', icon: '🏙️' },
  baashiqa: { nameEn: "Ba'ashiqa Hills", nameAr: 'تلال بعشيقة', lat: 36.4520, lon: 43.3480, alt: 385, group: 'nineveh', icon: '🏘️' },
  badush: { nameEn: 'Badush Ridge', nameAr: 'مرتفعات بادوش', lat: 36.5612, lon: 43.1120, alt: 512, group: 'nineveh', icon: '⛰️' },
  hatra: { nameEn: 'Al-Hatra', nameAr: 'الحضر', lat: 35.5890, lon: 42.7180, alt: 238, group: 'nineveh', icon: '🏛️' },
  sinjar: { nameEn: 'Mount Sinjar', nameAr: 'جبل سنجار', lat: 36.3710, lon: 41.8740, alt: 1420, group: 'nineveh', icon: '🌌' },
  baghdadCenter: { nameEn: 'Baghdad', nameAr: 'بغداد', lat: 33.3152, lon: 44.3661, alt: 34, group: 'iraq', icon: '🏙️' },
  basraCenter: { nameEn: 'Basra', nameAr: 'البصرة', lat: 30.5081, lon: 47.7835, alt: 5, group: 'iraq', icon: '🏙️' },
  erbilCenter: { nameEn: 'Erbil', nameAr: 'أربيل', lat: 36.1911, lon: 44.0092, alt: 420, group: 'iraq', icon: '🏙️' },
  najafCenter: { nameEn: 'Najaf', nameAr: 'النجف', lat: 31.9928, lon: 44.3168, alt: 54, group: 'iraq', icon: '🏙️' },
  sulaymaniyahCenter: { nameEn: 'Sulaymaniyah', nameAr: 'السليمانية', lat: 35.5558, lon: 45.4351, alt: 882, group: 'iraq', icon: '🏙️' },
  kirkukCenter: { nameEn: 'Kirkuk', nameAr: 'كركوك', lat: 35.4673, lon: 44.3855, alt: 350, group: 'iraq', icon: '🏙️' },
  ramadiCenter: { nameEn: 'Ramadi', nameAr: 'الرمادي', lat: 33.4243, lon: 43.3021, alt: 50, group: 'iraq', icon: '🏙️' },
  rutba: { nameEn: 'Ar-Rutbah Desert (35 km SW of town)', nameAr: 'صحراء الرطبة (35 كم جنوب غرب المدينة)', lat: 32.80, lon: 40.00, alt: 693, group: 'iraq', icon: '🌌' }
};

export const DEFAULT_SITE = 'mosulCenter';
