// Bilingual Internationalization (English & Arabic)
// Uses data-i18n attributes on DOM elements

export const translations = {
  en: {
    // Hero
    heroTitle: "Nineveh Dark Sky\nObservatory",
    heroBadge: "ASI Orbit Hackathon 2026 · Team Galaxy · Challenge 1",
    heroDesc: "We built a ground sensor that sees what NASA satellites miss — then trained an AI to correct the gap. The result: the first corrected light pollution map of Mosul.",
    heroLaunch: "🚀 Launch Live Demo",
    heroScience: "📖 Learn the Science",
    scrollHint: "↓ Scroll to explore ↓",

    // Problem
    probLabel: "The Problem",
    probTitle: "Why Are Mosul's Stars Disappearing?",
    probDesc: "Light pollution doesn't kill stars — it drowns them. City lights scatter through the atmosphere, making the sky glow brighter than the faintest stars. And satellites are underestimating the damage.",
    prob1Title: "Skyglow Over Cities",
    prob1Desc: "Street lights, billboards, and building facades send light upward and sideways. It scatters off air and dust particles, creating a bright dome (Skyglow) that erases thousands of faint stars.",
    prob2Title: "Satellites Miss the Full Picture",
    prob2Desc: "NASA's VIIRS sensor sees 500–900nm light going up. But modern LED lights emit blue light that scatters sideways — invisible to satellites. Real sky brightness is growing 9.6%/year vs 2% from space.",
    prob3Title: "Iraq's Dust Makes It Worse",
    prob3Desc: "Airborne dust particles act as scattering mirrors for city light. A pristine site 50km from Mosul can be ruined by a single dust storm. No satellite captures this local effect.",

    // Solution
    solLabel: "Our Solution",
    solTitle: "Ground Sensor + NASA + AI = Truth",
    solDesc: "We don't replace satellite data — we correct it. Our ESP32 device measures the sky from the ground, and our AI model learns the gap.",
    sol1Title: "ESP32 Ground Station",
    sol1Desc: "TSL2591 light sensor with dual channels (Visible+IR and IR-only), GPS module, gyroscope, and servo gimbal — all in a low-cost IoT package with WiFi streaming.",
    sol2Title: "NASA Black Marble Data",
    sol2Desc: "We pull VIIRS nighttime light data (VNP46A2/A3) and overlay it with atmospheric dust (CAMS AOD), moon phase, and cloud filters to build the satellite baseline.",
    sol3Title: "AI Hybrid Correction",
    sol3Desc: "A Random Forest model trained on ground truth learns how satellite readings drift under different LED ratios, dust levels, and lunar conditions — then corrects the map.",

    // Demo
    demoLabel: "Live Demo",
    demoTitle: "See It Working",
    demoDesc: "Pick an observation site in Nineveh and watch the full pipeline — from raw sensor data to AI-corrected sky quality.",
    demoSimulator: "SIMULATOR ACTIVE",
    demoESP32: "⚡ Connect ESP32 via USB",
    demoNASA: "🛰️ NASA Overlay",

    // Sites
    siteMosul: "🏙️ Mosul Downtown — Bortle 8",
    siteBaashiqa: "🏘️ Ba'ashiqa Hills — Bortle 5",
    siteBadush: "⛰️ Badush Ridge — Bortle 4",
    siteHatra: "🏛️ Al-Hatra — Bortle 3",
    siteSinjar: "🌌 Mount Sinjar — Bortle 2",
    siteBaghdad: "🏙️ Baghdad Center — Bortle 8/9",
    siteBasra: "🏙️ Basra Center — Bortle 8",
    siteErbil: "🏙️ Erbil Center — Bortle 8",
    siteRutba: "🌌 Ar-Rutbah (Desert) — Bortle 2",
    siteNajaf: "🏙️ Najaf Center — Bortle 8",
    siteNasiriyah: "🏙️ Nasiriyah — Bortle 8",
    siteSulaymaniyah: "🏙️ Sulaymaniyah — Bortle 8",
    siteRamadi: "🏙️ Ramadi — Bortle 7",
    siteKirkuk: "🏙️ Kirkuk — Bortle 8",

    // Telemetry Labels
    telLat: "Latitude",
    telLon: "Longitude",
    telAlt: "Elevation",
    telSQM: "Sky Quality",
    telNELM: "Faintest Star (NELM)",
    telBortle: "Bortle Class",
    telCH0: "CH0 (Vis+IR)",
    telCH1: "CH1 (IR Only)",
    telLamp: "Lamp Signature",
    telGyro: "Gyro Pitch",
    telDust: "Dust AOD",
    telMoon: "Moon",

    // Map
    secMap: "🗺️ Nineveh Observatory Map",

    // AI
    secAI: "🧠 AI Hybrid Correction — The Killer KPI",
    aiSatLabel: "Satellite Alone",
    aiSatSub: "mag/arcsec² (optimistic)",
    aiCorrLabel: "AI Corrected",
    aiCorrSub: "mag/arcsec² (ground truth)",
    aiKPILabel: "Error Reduction — AI hybrid model vs satellite alone (MAE)",

    // DarkSky
    secDarkSky: "🌙 DarkSky What-If Simulator",
    dsDesc: "What happens to Mosul's sky if the city adopts responsible lighting? Drag the sliders and watch the sky transform.",
    dsNow: "BEFORE (NOW)",
    dsAfter: "AFTER (DARKSKY)",
    dsGainLabel: "mag/arcsec² darker sky",
    dsStarsLabel: "more visible stars",
    dsEnergyLabel: "energy saved",
    ds1Name: "Turn Off Non-Essential Lights",
    ds1Sub: "Decorative, ornamental, facade lighting",
    ds2Name: "Full Cutoff Downward Shielding",
    ds2Sub: "Stop upward light spill from streetlamps",
    ds3Name: "Dim Municipal Lights",
    ds3Sub: "Max 50% — physically limited to +0.75 mag",
    ds4Name: "Post-Midnight Commercial Curfew",
    ds5Name: "Switch to 2200K Warm Amber LEDs",
    ds5Sub: "Replaces blue 5000K — less Rayleigh scatter",

    // Section labels
    secGround: "📡 Ground Station Telemetry",
    espSettingsBtn: "⚙️ Device Settings",
    espCalibTitle: "Sensor Calibration Offset (Δ Mag)",

    // Auto-Calibration
    secAutoCalib: "🎯 Auto-Calibration System",
    calibDesc: "Select an observation site from the map, then choose the planet to calibrate for and mathematically compute the required lighting reduction.",
    calibStep1: "Step 1: Location Selected from Map",
    calibPickMap: "🗺️ Pick from Map",
    calibCurrentLabel: "Current Sky Brightness (B_old):",
    calibStep2: "Step 2: Choose Target Planet to Calibrate For:",
    calibOptMercury: "🪨 Mercury (عطارد) — Craters & Rocky Basin · 19.80 mag",
    calibOptVenus: "🌕 Venus (الزهرة) — Sulfuric Atmosphere & Crescent · 18.80 mag",
    calibOptEarth: "🌍 Earth & Moon (الأرض والقمر) — Oceans & Rotating Clouds · 19.20 mag",
    calibOptMars: "🔴 Mars (المريخ) — Polar Ice Caps & Surface Maria · 20.20 mag",
    calibOptJupiter: "🌕 Jupiter (المشتري) — Cloud Belts & Red Spot · 20.00 mag",
    calibOptSaturn: "🪐 Saturn (زحل) — Rings & Cassini Division · 20.50 mag",
    calibOptUranus: "🔵 Uranus (أورانوس) — Aquamarine Giant & Tilt · 21.00 mag",
    calibOptNeptune: "🔷 Neptune (نبتون) — Deep Azure & Methane Storms · 21.50 mag",
    calibOptPluto: "🪐 Pluto (بلوتو) — Nitrogen Heart Glacier · 21.85 mag",
    planetSimTitle: "🔭 Live Telescope Viewport (Simulation)",
    planetModeCurrent: "📍 Current Sky at Site (B_old)",
    planetModeCalib: "✨ After Auto-Calibration (B_target)",
    calibBtn: "⚡ Step 3: Calculate Auto-Calibration",
    calibResReduction: "Required Lighting Reduction:",
    calibResReductionSub: "Municipal flux dimming",
    calibResNELM: "Expected NELM (Faintest Star Visible):",
    calibResNELMSub: "Unihedron visual limit",
    calibResTarget: "Target Sky Quality:",
    calibResTargetSub: "Zenith surface brightness",

    // Telescope Guidance & Mount Calibration
    teleGuidanceTitle: "🔭 Telescope Guidance, Coordinates & Mount Calibration",
    teleCoordTitle: "Celestial Coordinates (Ephemeris)",
    teleMountTitle: "Mount Auto-Calibration",
    teleOpticTitle: "Optical Guidance & Filters",
    teleRa: "Right Ascension (RA):",
    teleDec: "Declination (Dec):",
    teleAlt: "Altitude (Alt):",
    teleAz: "Azimuth (Az):",
    telePolar: "Polar Alignment:",
    teleTrack: "Tracking Rate:",
    teleFilter: "Recommended Optical Filter:",
    teleEyepiece: "Eyepiece & Power:",
    teleWindow: "Optimal Window:",
    teleStatus: "Calibration Status:",

    // Footer
    footer: "Team Galaxy · ASI Orbit Hackathon 2026 · Challenge 1: Light Pollution & Dark Sky"
  },

  ar: {
    // Hero
    heroTitle: "مرصد نينوى\nللسماء المظلمة",
    heroBadge: "هاكاثون ASI أوربت ٢٠٢٦ · فريق غالاكسي · التحدي ١",
    heroDesc: "بنينا حساس أرضي يشوف اللي الأقمار الصناعية ما تشوفه — وبعدين درّبنا ذكاء اصطناعي يصحح الفرق. النتيجة: أول خارطة مصححة للتلوث الضوئي في الموصل.",
    heroLaunch: "🚀 ابدأ العرض التجريبي",
    heroScience: "📖 اقرأ العلم",
    scrollHint: "↓ اسحب للأسفل ↓",

    // Problem
    probLabel: "المشكلة",
    probTitle: "لماذا تختفي النجوم في سماء العراق؟",
    probDesc: "التلوث الضوئي لا يطفئ النجوم بل يطمسها. تتشتت أضواء المدينة في الجو لتجعل السماء أسطع من النجوم الخافتة، في حين تُقلل الأقمار الصناعية من تقدير حجم هذا الضرر.",
    prob1Title: "التوهج السماوي (Skyglow)",
    prob1Desc: "تُرسل إنارة الشوارع واللوحات الإعلانية والواجهات أضواءها نحو الأعلى والجوانب. يتشتت هذا الضوء بفعل الهواء والغبار ليصنع قبة مضيئة تحجب آلاف النجوم.",
    prob2Title: "الأقمار الصناعية لا ترى الصورة الكاملة",
    prob2Desc: "يرصد مستشعر VIIRS الضوء المتجه للأعلى. لكن مصابيح LED الحديثة تبعث ضوءاً أزرق يتشتت أفقياً — ولا تراه الأقمار الصناعية. ولهذا يزيد السطوع الفعلي بنسبة ٩.٦٪ سنوياً مقابل ٢٪ فقط تُرصد من الفضاء.",
    prob3Title: "الغبار الجوي يفاقم المشكلة",
    prob3Desc: "تعمل ذرات الغبار كمرايا تعكس وتشتت أضواء المدينة. يمكن لعاصفة غبارية واحدة أن تفسد موقعاً نقياً خارج المدينة، وهو تأثير محلي لا ترصده الأقمار الصناعية أبداً.",

    // Solution
    solLabel: "الحل المقترح",
    solTitle: "مستشعر أرضي + بيانات ناسا + ذكاء اصطناعي = دقة مطلقة",
    solDesc: "نحن لا نستبدل بيانات الأقمار الصناعية، بل نقوم بتصحيحها. يقوم مستشعرنا الأرضي (ESP32) بقياس جودة السماء من الأرض، بينما يتعلم الذكاء الاصطناعي كيفية سد الفجوة وتصحيح القراءات.",
    sol1Title: "محطة الرصد الأرضية (ESP32)",
    sol1Desc: "مستشعر ضوئي (TSL2591) مزود بقناتين للرؤية، وحدة GPS، مقياس تسارع، ومحركات توجيه، مدمجة في جهاز ذكي منخفض التكلفة متصل بالإنترنت.",
    sol2Title: "بيانات مشروع ناسا (Black Marble)",
    sol2Desc: "نستخرج بيانات الإضاءة الليلية من قمر VIIRS وندمجها مع بيانات الغبار الجوي ومراحل القمر والغيوم لبناء خط أساس للرصد الفضائي.",
    sol3Title: "التصحيح الهجين بالذكاء الاصطناعي",
    sol3Desc: "نموذج ذكاء اصطناعي مُدرب على القراءات الميدانية، يتعلم كيفية تعويض انحراف قراءات الأقمار الصناعية في ظل وجود مصابيح LED والغبار، ليقوم بتصحيح خريطة التلوث الضوئي بدقة.",

    // Demo
    demoLabel: "تجربة حية",
    demoTitle: "شاهد النظام قيد العمل",
    demoDesc: "اختر موقعاً للرصد وشاهد مسار تدفق البيانات بالكامل — بدءاً من القراءات الخام للمستشعر الأرضي وصولاً إلى جودة السماء المصححة عبر الذكاء الاصطناعي.",
    demoSimulator: "نظام المحاكاة فعّال",
    demoESP32: "⚡ اتصال بجهاز ESP32",
    demoNASA: "🛰️ تفعيل خريطة ناسا",

    // Sites
    siteMosul: "🏙️ وسط الموصل — بورتل ٨",
    siteBaashiqa: "🏘️ تلال بعشيقة — بورتل ٥",
    siteBadush: "⛰️ مرتفعات بادوش — بورتل ٤",
    siteHatra: "🏛️ الحضر — بورتل ٣",
    siteSinjar: "🌌 جبل سنجار — بورتل ٢",
    siteBaghdad: "🏙️ مركز بغداد — بورتل ٨/٩",
    siteBasra: "🏙️ مركز البصرة — بورتل ٨",
    siteErbil: "🏙️ مركز أربيل — بورتل ٨",
    siteRutba: "🌌 الرطبة (صحراء) — بورتل ٢",
    siteNajaf: "🏙️ مركز النجف — بورتل ٨",
    siteNasiriyah: "🏙️ الناصرية — بورتل ٨",
    siteSulaymaniyah: "🏙️ السليمانية — بورتل ٨",
    siteRamadi: "🏙️ الرمادي — بورتل ٧",
    siteKirkuk: "🏙️ كركوك — بورتل ٨",

    // Telemetry
    telLat: "خط العرض",
    telLon: "خط الطول",
    telAlt: "الارتفاع",
    telSQM: "جودة السماء",
    telNELM: "أخفت نجم (NELM)",
    telBortle: "تصنيف بورتل",
    telCH0: "CH0 (مرئي+IR)",
    telCH1: "CH1 (IR فقط)",
    telLamp: "نوع الإضاءة",
    telGyro: "ميلان الجايرو",
    telDust: "غبار AOD",
    telMoon: "إضاءة القمر",

    // Map
    secMap: "🗺️ خريطة مرصد نينوى",

    // AI
    secAI: "🧠 التصحيح الهجين — الدقة المطلقة",
    aiSatLabel: "بيانات القمر الصناعي فقط",
    aiSatSub: "mag/arcsec² (غير دقيق)",
    aiCorrLabel: "بعد تصحيح الذكاء الاصطناعي",
    aiCorrSub: "mag/arcsec² (دقة أرضية مطابقة)",
    aiKPILabel: "نسبة تصحيح الخطأ (النموذج الهجين مقارنة بالقمر الصناعي)",

    // DarkSky
    secDarkSky: "🌙 محاكي الإضاءة المسؤولة",
    dsDesc: "ماذا سيحدث لسماء مدينتك إذا تم تطبيق معايير الإضاءة المسؤولة؟ قُم بتعديل المؤشرات أدناه وشاهد سماء الليل وهي تستعيد صفاءها.",
    dsNow: "قبل (الوضع الحالي)",
    dsAfter: "بعد (الإضاءة المسؤولة)",
    dsGainLabel: "مقدار تحسن الظلام (mag)",
    dsStarsLabel: "نجوم جديدة مرئية",
    dsEnergyLabel: "توفير الطاقة",
    ds1Name: "إطفاء الإنارة غير الضرورية",
    ds1Sub: "الإنارة التجميلية، إضاءة الواجهات، والزينة",
    ds2Name: "توجيه وحجب الإنارة (Shielding)",
    ds2Sub: "استخدام أغطية تمنع تشتت ضوء الشوارع نحو السماء",
    ds3Name: "تخفيت إضاءة الشوارع (Dimming)",
    ds3Sub: "تخفيض السطوع تدريجياً في أوقات متأخرة من الليل",
    ds4Name: "إطفاء اللوحات الإعلانية بعد منتصف الليل",
    ds5Name: "استخدام إضاءة دافئة (٢٢٠٠K)",
    ds5Sub: "استبدال الأضواء البيضاء/الزرقاء لتقليل التشتت البصري",

    // Section labels
    secGround: "📡 قراءات المحطة الأرضية",
    espSettingsBtn: "⚙️ إعدادات الحساس",
    espCalibTitle: "معايرة الحساس الضوئي (Δ Mag)",

    // Auto-Calibration
    secAutoCalib: "🎯 نظام المعايرة الذاتية الذكي",
    calibDesc: "حدد موقع الرصد من الخريطة، ثم اختر الكوكب المطلوب لمعايرة السماء وحساب نسبة التخفيت بدقة هندسية.",
    calibStep1: "الخطوة ١: الموقع المختار من الخريطة",
    calibPickMap: "🗺️ اختر من الخريطة",
    calibCurrentLabel: "سطوع السماء الحالي (B_old):",
    calibStep2: "الخطوة ٢: اختر الكوكب المستهدف لمعايرة السماء:",
    calibOptMercury: "🪨 كوكب عطارد — الفوهات والحوض الصخري · ١٩.٨٠",
    calibOptVenus: "🌕 كوكب الزهرة — الغلاف الكبريتي الكثيف · ١٨.٨٠",
    calibOptEarth: "🌍 كوكب الأرض والقمر — المحيطات والغيوم الدوارة · ١٩.٢٠",
    calibOptMars: "🔴 كوكب المريخ — القمم الجليدية والتضاريس · ٢٠.٢٠",
    calibOptJupiter: "🌕 كوكب المشتري — أحزمة الغيوم والبقعة الحمراء · ٢٠.٠٠",
    calibOptSaturn: "🪐 كوكب زحل — الحلقات وفجوة كاسيني · ٢٠.٥٠",
    calibOptUranus: "🔵 كوكب أورانوس — العملاق الجليدي وميلان المحور · ٢١.٠٠",
    calibOptNeptune: "🔷 كوكب نبتون — الأزرق الملكي وعواصف الميثان · ٢١.٥٠",
    calibOptPluto: "🪐 كوكب بلوتو — النهر الجليدي النيتروجيني · ٢١.٨٥",
    planetSimTitle: "🔭 نافذة الرصد التلسكوبي المباشر (محاكاة)",
    planetModeCurrent: "📍 سماء الموقع الحالي (B_old)",
    planetModeCalib: "✨ بعد المعايرة الذاتية (B_target)",
    calibBtn: "⚡ الخطوة ٣: حساب المعايرة الذاتية",
    calibResReduction: "نسبة تخفيض الإضاءة المطلوبة:",
    calibResReductionSub: "تخفيض التدفق الضوئي للمدينة",
    calibResNELM: "القدر الظاهري للعين المجردة (NELM):",
    calibResNELMSub: "وفق معادلة يوني هيدرون",
    calibResTarget: "جودة السماء المستهدفة:",
    calibResTargetSub: "سطوع السطح عند السمت",

    // Telescope Guidance & Mount Calibration
    teleGuidanceTitle: "🔭 توجيهات وإحداثيات ومعايرة التلسكوب",
    teleCoordTitle: "الإحداثيات السماوية للرصد (Ephemeris)",
    teleMountTitle: "معايرة محاذاة وتعقب المحركات",
    teleOpticTitle: "توجيهات العدسات والفلاتر البصرية",
    teleRa: "المطلع المستقيم (RA):",
    teleDec: "الميل الزاوي (Dec):",
    teleAlt: "الارتفاع عن الأفق (Alt):",
    teleAz: "السمت البوصلي (Az):",
    telePolar: "المحاذاة القطبية:",
    teleTrack: "معدل التعقب الحركي:",
    teleFilter: "الفلتر البصري الموصى به:",
    teleEyepiece: "العدسة والتكبير:",
    teleWindow: "نافذة الرصد المثالية:",
    teleStatus: "حالة المعايرة:",

    // Footer
    footer: "فريق غالاكسي · هاكاثون ASI أوربت ٢٠٢٦ · التحدي الأول: التلوث الضوئي والسماء المظلمة"
  }
};

let currentLang = 'en';

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  updateDOMTranslations();
}

export function t(key) {
  return translations[currentLang][key] || key;
}

export function updateDOMTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = translations[currentLang][key];
    if (val) {
      if (el.tagName === 'OPTION') el.textContent = val;
      else if (el.tagName === 'INPUT' || el.tagName === 'BUTTON') el.textContent = val;
      else el.textContent = val;
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = translations[currentLang][key];
    if (val) el.innerHTML = val.replace(/\n/g, '<br/>');
  });
}
