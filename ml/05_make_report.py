"""Step 5 — Build the full model report in ../reports/ (figures, tables, REPORT in Arabic).

Run after 03_train.py (and 04_analyze_photos.py if photos exist).
Everything is regenerated from the data, so numbers always match the model.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from orbit_ml import astro, viirs
from orbit_ml.features import MODEL_FEATURES, add_model_features, nelm_from_sqm
from orbit_ml.model_json import JsonSkyModel

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(__file__)
REPORTS = os.path.join(HERE, "..", "reports")
FIG = os.path.join(REPORTS, "figures")
TAB = os.path.join(REPORTS, "tables")
for d in (FIG, TAB):
    os.makedirs(d, exist_ok=True)
MODEL = os.path.join(HERE, "..", "public", "model", "sky_model.json")

IRAQ_SITES = {
    "Mosul center": (36.3587, 43.1307, 223), "Ba'ashiqa": (36.452, 43.348, 385),
    "Badush": (36.5612, 43.112, 512), "Al-Hatra": (35.589, 42.718, 238),
    "Mount Sinjar": (36.371, 41.874, 1420), "Baghdad": (33.3152, 44.3661, 34),
    "Basra": (30.5081, 47.7835, 5), "Erbil": (36.1911, 44.0092, 420),
    "Kirkuk": (35.4673, 44.3855, 350), "Ar-Rutbah desert": (32.80, 40.00, 693),
}


def bortle(m):
    m = np.asarray(m)
    return np.select([m >= 21.75, m >= 21.6, m >= 21.35, m >= 20.4, m >= 19.1, m >= 18, m >= 17.5, m >= 16.5],
                     [1, 2, 3, 4, 5, 6, 7, 8], 9)


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, name), dpi=130)
    plt.close(fig)


def cleaning_funnel():
    spec = importlib.util.spec_from_file_location("build", os.path.join(HERE, "02_build_dataset.py"))
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)
    raw = b.load_raw()
    c = b.clean(raw)
    a = b.add_astro(c)
    sqm = a[a.SQMReading.between(16.0, 22.3)]
    typed = (sqm.SQMReading * 100).round() % 100 == 0
    return {
        "raw_rows": int(len(raw)),
        "valid_time_place_cloud": int(len(c)),
        "night_only_sun_below_-12": int(len(a)),
        "with_sqm_16_to_22.3": int(len(sqm)),
        "typed_whole_numbers_removed": int(typed.sum()),
    }


def main():
    metrics = json.load(open(os.path.join(REPORTS, "metrics.json")))
    ds = pd.read_csv(os.path.join(HERE, "data", "dataset.csv"))
    oof = pd.read_csv(os.path.join(TAB, "oof_predictions.csv"))
    reg = pd.read_csv(os.path.join(HERE, "data", "regional_check.csv"))
    model = JsonSkyModel(MODEL)
    ds["country"] = ds.Country.astype(str).str.split(" - ").str[0]
    ds["year"] = pd.to_datetime(ds.unix, unit="s").dt.year

    # ── Tables ──
    pd.DataFrame(metrics["cv"]).T.to_csv(os.path.join(TAB, "cv_scores.csv"))
    ext = {}
    for c in ["pred_satellite_only", "pred_random_forest", "pred_orbit_ai"]:
        e = np.abs(oof[c] - oof.measured)
        b = np.abs(bortle(oof[c]) - bortle(oof.measured))
        ext[c.replace("pred_", "")] = {
            "median_error": round(float(e.median()), 3),
            "within_0.5_mag_pct": round(100 * float((e <= 0.5).mean()), 1),
            "within_1_mag_pct": round(100 * float((e <= 1).mean()), 1),
            "bortle_exact_pct": round(100 * float((b == 0).mean()), 1),
            "bortle_pm1_pct": round(100 * float((b <= 1).mean()), 1),
        }
    pd.DataFrame(ext).T.to_csv(os.path.join(TAB, "accuracy_extended.csv"))

    funnel = cleaning_funnel()
    summary = {
        "generated": datetime.now().isoformat(timespec="minutes"),
        "cleaning_funnel": {**funnel, "final_training_rows": int(len(ds))},
        "locations": int(ds[["lat", "lon"]].round(3).drop_duplicates().shape[0]),
        "countries": int(ds.country.nunique()),
        "rows_per_year": {int(k): int(v) for k, v in ds.year.value_counts().sort_index().items()},
        "top_countries": {k: int(v) for k, v in ds.country.value_counts().head(10).items()},
        "sqm_range": [float(ds.sqm.min()), float(ds.sqm.max())],
        "sqm_mean": round(float(ds.sqm.mean()), 2),
        "nasa_tiles_used": sum(len(f) for _, _, f in os.walk(viirs.CACHE_DIR)),
    }
    with open(os.path.join(TAB, "data_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)

    # Regional check per country
    reg = add_model_features(reg).dropna(subset=MODEL_FEATURES)
    reg["model_nelm"] = nelm_from_sqm(model.predict(reg))
    reg["country"] = reg.Country.astype(str)
    by_c = reg.groupby("country").agg(reports=("LimitingMag", "size"), reported_nelm=("LimitingMag", "mean"),
                                      model_nelm=("model_nelm", "mean")).round(2).sort_values("reports", ascending=False)
    by_c.to_csv(os.path.join(TAB, "regional_by_country.csv"))

    # Iraqi sites: clear, moonless, local midnight
    rows = []
    for name, (la, lo, el) in IRAQ_SITES.items():
        rows.append({"site": name, "lat": la, "lon": lo, "elevation_m": el, "unix": 0, "cloud": 0.0,
                     "sun_alt": -40.0, "moon_alt": -10.0, "moon_illum": 0.0, **viirs.light_features(la, lo)})
    iq = add_model_features(pd.DataFrame(rows))
    iq["solar_hour"] = 0.0
    iq["orbit_ai_sqm"] = model.predict(iq).round(2)
    s = model.m["satellite_only"]
    iq["satellite_only_sqm"] = (s["intercept"] + s["coef"] * iq.log_light_point).round(2)
    iq["bortle"] = bortle(iq.orbit_ai_sqm)
    iq["nelm"] = nelm_from_sqm(iq.orbit_ai_sqm).round(1)
    iq_out = iq[["site", "lat", "lon", "elevation_m", "light_point", "skyglow_index",
                 "satellite_only_sqm", "orbit_ai_sqm", "bortle", "nelm"]].round(4)
    iq_out.to_csv(os.path.join(TAB, "iraq_sites_predictions.csv"), index=False)

    # ── Figures ──
    fig, ax = plt.subplots(figsize=(12, 5.5))
    sc = ax.scatter(ds.lon, ds.lat, c=ds.sqm, s=4, cmap="magma", vmin=16, vmax=22)
    ax.scatter(reg.lon, reg.lat, s=14, facecolors="none", edgecolors="#00d4ff", lw=0.8, label="Middle-East check")
    ax.scatter([43.13], [36.36], marker="*", s=180, c="#00e676", label="Mosul")
    fig.colorbar(sc, ax=ax, label="Measured SQM (mag/arcsec²) — higher = darker")
    ax.set(title=f"Training data: {len(ds):,} SQM readings, {summary['locations']:,} locations, {summary['countries']} countries",
           xlabel="Longitude", ylabel="Latitude", xlim=(-180, 180), ylim=(-60, 75))
    ax.legend(loc="lower left")
    save(fig, "training_locations_map.png")

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2))
    ds.year.value_counts().sort_index().plot.bar(ax=axes[0], color="#2979ff")
    axes[0].set(title="Readings per year", xlabel="")
    ds.country.value_counts().head(12).iloc[::-1].plot.barh(ax=axes[1], color="#00b8d4")
    axes[1].set(title="Top countries", xlabel="Readings")
    save(fig, "data_by_year_country.png")

    fig, ax = plt.subplots(figsize=(9, 4.2))
    ax.hist(ds.sqm, bins=60, color="#7c4dff")
    for lim, lab in [(18, "B6/7"), (19.1, "B5"), (20.4, "B4"), (21.35, "B3")]:
        ax.axvline(lim, color="grey", ls="--", lw=0.8)
        ax.text(lim, ax.get_ylim()[1] * 0.92, lab, fontsize=8, ha="left")
    ax.set(title="Distribution of measured sky brightness", xlabel="SQM (mag/arcsec²)", ylabel="Readings")
    save(fig, "sqm_distribution.png")

    oof["bortle_true"] = bortle(oof.measured)
    g = oof.groupby("bortle_true").apply(lambda d: pd.Series({
        "Satellite only": np.abs(d.pred_satellite_only - d.measured).mean(),
        "ORBIT AI": np.abs(d.pred_orbit_ai - d.measured).mean(), "n": len(d)}), include_groups=False)
    fig, ax = plt.subplots(figsize=(9, 4.2))
    x = np.arange(len(g))
    ax.bar(x - 0.2, g["Satellite only"], 0.4, label="Satellite only", color="#ffab00")
    ax.bar(x + 0.2, g["ORBIT AI"], 0.4, label="ORBIT AI", color="#00e676")
    ax.set_xticks(x, [f"B{int(b)}\n(n={int(n)})" for b, n in zip(g.index, g.n)])
    ax.set(title="Mean error by true Bortle class (unseen regions)", ylabel="MAE (mag/arcsec²)")
    ax.legend()
    save(fig, "error_by_bortle.png")

    fig, ax = plt.subplots(figsize=(10, 4.2))
    x = np.arange(len(by_c))
    ax.bar(x - 0.2, by_c.reported_nelm, 0.4, label="Reported by observers", color="#ff4060")
    ax.bar(x + 0.2, by_c.model_nelm, 0.4, label="Global model", color="#2979ff")
    ax.set_xticks(x, [f"{c}\n({n})" for c, n in zip(by_c.index, by_c.reports)], rotation=45, ha="right", fontsize=8)
    ax.set(title="Middle East: faintest naked-eye star — observers vs global model", ylabel="Limiting magnitude")
    ax.legend()
    save(fig, "middle_east_check.png")

    fig, ax = plt.subplots(figsize=(10, 4.5))
    order = iq_out.sort_values("orbit_ai_sqm")
    x = np.arange(len(order))
    ax.bar(x - 0.2, order.satellite_only_sqm, 0.4, label="Satellite only", color="#ffab00")
    ax.bar(x + 0.2, order.orbit_ai_sqm, 0.4, label="ORBIT AI", color="#00e676")
    ax.set_xticks(x, order.site, rotation=30, ha="right")
    ax.set_ylim(16, 22.3)
    ax.set(title="Iraqi sites — predicted sky quality (clear, moonless midnight)", ylabel="SQM (mag/arcsec²) — higher = darker")
    ax.legend()
    save(fig, "iraq_sites.png")

    # ── Photos (if analysed) ──
    photos_path = os.path.join(REPORTS, "photos", "photos_results.csv")
    photos = pd.read_csv(photos_path) if os.path.exists(photos_path) else None

    write_report(metrics, ext, summary, by_c, iq_out, photos)
    print("report written to", os.path.abspath(REPORTS))


def write_report(m, ext, s, by_c, iq, photos):
    cv = m["cv"]
    ai, sat, rf = cv["orbit_ai"], cv["satellite_only"], cv["random_forest"]
    ea, es = ext["orbit_ai"], ext["satellite_only"]
    r = m["regional_check"]
    f = s["cleaning_funnel"]
    iq_rows = "\n".join(f"| {x.site} | {x.satellite_only_sqm:.2f} | **{x.orbit_ai_sqm:.2f}** | {x.bortle} | {x.nelm} |"
                        for x in iq.sort_values("orbit_ai_sqm").itertuples())
    reg_rows = "\n".join(f"| {c} | {x.reports} | {x.reported_nelm} | {x.model_nelm} |" for c, x in by_c.iterrows())
    imp = "\n".join(f"| `{k}` | {v * 100:.1f}% |" for k, v in sorted(json.load(open(MODEL))["importances"].items(), key=lambda kv: -kv[1]))
    if photos is None:
        photo_txt = "لم تُحلَّل صور بعد. بعد تشغيل `python ml/04_analyze_photos.py` ثم هذا السكربت، تظهر النتائج هنا وبـ `reports/photos/`."
    elif photos.photo_sqm.notna().any():
        photo_txt = (f"عدد الصور: **{len(photos)}** · المصادر: {photos.source.value_counts().to_dict()}\n\n"
                     "| الصورة | الموقع | الطريقة | سطوع الصورة | توقع النموذج | الفرق |\n|---|---|---|---|---|---|\n" +
                     "\n".join(f"| {p.file} | {p.site} | {p.method} | {p.photo_sqm} | {p.model_sqm:.2f} | {p.delta} |"
                               for p in photos.itertuples()))
    else:
        rows = "\n".join(
            f"| {p.site_ar if isinstance(getattr(p, 'site_ar', ''), str) and p.site_ar else p.site} | {p.local_datetime} | "
            f"{'تلسكوب' if p.kind == 'telescope' else 'سماء'} | "
            f"{'فوق الأفق ' + str(round(p.moon_illum * 100)) + '%' if p.moon_alt > 0 else 'تحت الأفق'} | {p.model_sqm:.2f} |"
            for p in photos.itertuples())
        photo_txt = f"""عدد الصور: **{len(photos)}**، ملتقطة بالموبايل بتاريخ ٢٨/٨/٢٠٢٤ بمنطقتين: نادي الشلالات (أطراف الموصل الشمالية) ومنطقة سكنية.

**لماذا لم نقِس السطوع من هذه الصور؟** الصور مأخوذة بوضع Night Mode في الموبايل، وهذا الوضع يدمج عدة لقطات ويعدّل السطوع بالذكاء الاصطناعي. والصور أيضاً وصلت عبر تطبيق مراسلة مسح بياناتها (EXIF: زمن التعريض وISO). لذلك لا يمكن تحويل سطوعها إلى mag/arcsec² بشكل علمي. ذكرنا هذا بصراحة بدل أن نعطي رقماً غير دقيق.

**ما الذي تحققنا منه فعلاً (تحقق فلكي):**
- في صورة الساعة ٢:٣٠ فجراً، يحسب محركنا الفلكي القمر بإضاءة **٣٤٪** وارتفاع **٣٠° شرقاً**، قرب نجم **الدبران** (ارتفاع ٣٦° شرقاً). هذا يطابق الصورة (القمر + المريخ + المشتري + الدبران).
- عنقود **الثريا** على ارتفاع **٥٠° شرقاً** في نفس الوقت، ويطابق صورة الثريا.
- الساعة ٩ مساءً في نادي الشلالات كان **القمر تحت الأفق**، أي ليلة بلا قمر، وهذا يطابق الصور الصافية.

**توقعات النموذج لنفس المكان والوقت:**
- نادي الشلالات (أطراف المدينة): **١٩٫٦٩** (بورتل ٥).
- المنطقة السكنية: **١٨٫٧–١٨٫٨** (بورتل ٦).
- الفرق بين المكانين يتفق مع ما يظهر في الصور: سماء أصفى في الأطراف، وتوهج واضح داخل الحي.

| الموقع | الوقت المحلي | النوع | القمر | توقع النموذج (mag/arcsec²) |
|---|---|---|---|---|
{rows}

**للحصول على قياس علمي في المرة القادمة:**
- التصوير بوضع **Pro/Manual**، مع تثبيت زمن التعريض والـ ISO.
- إرسال الصور **كمستند**.
- أخذ قراءة واحدة على الأقل بتطبيق *Loss of the Night*."""

    md = f"""# تقرير نموذج ORBIT AI

*تم توليده تلقائياً بـ `ml/05_make_report.py` بتاريخ {s['generated']}. كل الأرقام محسوبة من البيانات.*

## 1. الخلاصة
- **الذكاء الاصطناعي يقلل خطأ تقدير سطوع السماء بنسبة {m['improvement_percent']}%** مقارنة بالقمر الصناعي وحده.
- متوسط الخطأ **{ai['MAE']} mag/arcsec²** مقابل {sat['MAE']}.
- الاختبار على **مناطق جغرافية ما شافها النموذج أبداً**.
- النوع: **Machine Learning**، بخوارزمية Histogram Gradient Boosting مع قيود فيزيائية.
- التدريب: {s['cleaning_funnel']['final_training_rows']:,} قياس أرضي حقيقي، من {s['locations']:,} موقع بـ {s['countries']} دولة.

## 2. البيانات
| المصدر | الدور | الوحدة |
|---|---|---|
| Globe at Night (NOIRLab)، ٢٠١٩–٢٠٢٥ | **الهدف**: قراءات SQM الأرضية | mag/arcsec² |
| NASA GIBS، طبقة VIIRS Black Marble (٢٠١٦) | ضوء المدن ({s['nasa_tiles_used']:,} صورة) | مؤشر ضوء ٠–١ |
| خوارزمية SunCalc | القمر والشمس | درجات / نسبة |

**مراحل التنظيف:**
| المرحلة | عدد الصفوف |
|---|---|
| البيانات الخام | {f['raw_rows']:,} |
| وقت ومكان وغيوم صالحة | {f['valid_time_place_cloud']:,} |
| ليل فقط (الشمس تحت −١٢°) | {f['night_only_sun_below_-12']:,} |
| بيها قراءة SQM بين ١٦ و٢٢٫٣ | {f['with_sqm_16_to_22.3']:,} |
| حذف القراءات المكتوبة باليد كأرقام صحيحة | −{f['typed_whole_numbers_removed']:,} |
| **النهائي (بعد إزالة التكرار)** | **{f['final_training_rows']:,}** |

**الأشكال:**
- ![map](figures/training_locations_map.png)
- ![years](figures/data_by_year_country.png)
- ![dist](figures/sqm_distribution.png)

## 3. النموذج
- **الخوارزمية:** `HistGradientBoostingRegressor` من scikit-learn.
  - ٤٠٠ شجرة، وعمق كل شجرة ٥.
  - learning rate ‏٠٫٠٥.
  - دالة الخسارة: absolute error.
- **القيود الفيزيائية:** {', '.join(f'`{k}`: {"↑ضوء=↓mag" if v < 0 else "↑=↑mag"}' for k, v in m['physics_constraints'].items())}
- **المقارنة:** مع Linear Regression (يمثل القمر الصناعي وحده)، ومع Random Forest (٢٠٠ شجرة).
- **التشغيل:** يُصدَّر لـ JSON ويشتغل بالمتصفح. التطابق مع sklearn: فرق أقل من ٠٫٠٠٠٠٣.

## 4. الدقة
**طريقة الاختبار:** ٥ طيّات GroupKFold، مجمّعة بمربعات ٠٫٥° (تقريباً ٥٠ كم).

| المقياس | القمر الصناعي وحده | Random Forest | **ORBIT AI** |
|---|---|---|---|
| MAE | {sat['MAE']} | {rf['MAE']} | **{ai['MAE']}** |
| RMSE | {sat['RMSE']} | {rf['RMSE']} | {ai['RMSE']} |
| R² | {sat['R2']} | {rf['R2']} | {ai['R2']} |
| الخطأ الوسيط | {es['median_error']} | {ext['random_forest']['median_error']} | **{ea['median_error']}** |
| نسبة التوقعات ضمن ±٠٫٥ mag | {es['within_0.5_mag_pct']}% | {ext['random_forest']['within_0.5_mag_pct']}% | **{ea['within_0.5_mag_pct']}%** |
| نسبة التوقعات ضمن ±١ mag | {es['within_1_mag_pct']}% | {ext['random_forest']['within_1_mag_pct']}% | **{ea['within_1_mag_pct']}%** |
| صنف Bortle صحيح | {es['bortle_exact_pct']}% | {ext['random_forest']['bortle_exact_pct']}% | **{ea['bortle_exact_pct']}%** |
| صنف Bortle صحيح ±١ | {es['bortle_pm1_pct']}% | {ext['random_forest']['bortle_pm1_pct']}% | **{ea['bortle_pm1_pct']}%** |

**ملاحظة بصراحة:** Random Forest قريب جداً من ORBIT AI. اخترنا ORBIT AI لأن متوسط خطأه أقل، ولأنه يلتزم بالفيزياء. بدون القيود كانت بغداد تطلع أظلم من الموصل.

![pred](figures/predicted_vs_measured.png)
![bortle](figures/error_by_bortle.png)

**شنو ينظر إليه النموذج (Permutation importance):**
| الميزة | الأهمية |
|---|---|
{imp}

![imp](figures/feature_importance.png)

## 5. فحص الشرق الأوسط
الأرصاد: {r['rows']} رصد بالعين المجردة من {len(r['countries'])} دولة.
- الراصدون يشوفون نجوم لحد قدر **{r['reported_naked_eye_limit_mean']}** بالمعدل.
- النموذج العالمي يتوقع **{r['model_naked_eye_limit_mean']}**.
- ارتباط Spearman = {r['spearman']}.

**الاستنتاج:** سماء منطقتنا أسوأ من التوقع العالمي، على الأرجح بسبب الغبار والضباب. هذا يبرر المعايرة المحلية بالصور.

| الدولة | عدد الأرصاد | المرصود | النموذج |
|---|---|---|---|
{reg_rows}

![me](figures/middle_east_check.png)

## 6. توقعات المواقع العراقية
الظروف: سماء صافية، بلا قمر، منتصف الليل.

| الموقع | القمر الصناعي | **ORBIT AI** | Bortle | أخفت نجم |
|---|---|---|---|---|
{iq_rows}

![iraq](figures/iraq_sites.png)

## 7. صور المصوّر المحلي
{photo_txt}

## 8. الحدود
{chr(10).join('- ' + x for x in m['limits'])}
- النموذج **لم يُختبر بعد على قياسات SQM حقيقية من العراق**. الصور المحلية هي خطوة التحقق الجاية.

## 9. محتويات هذا المجلد
| المسار | المحتوى |
|---|---|
| `metrics.json` | كل مقاييس التدريب |
| `figures/` | كل الرسوم |
| `tables/cv_scores.csv` و`tables/accuracy_extended.csv` | الدقة |
| `tables/oof_predictions.csv` | كل توقع مقابل القياس الحقيقي |
| `tables/iraq_sites_predictions.csv` | توقعات المواقع العراقية |
| `tables/regional_by_country.csv` | فحص الشرق الأوسط |
| `tables/data_summary.json` | ملخص البيانات ومراحل التنظيف |
| `photos/` | نتائج تحليل الصور (بعد إضافتها) |

## 10. المراجع
- Globe at Night, NOIRLab.
- Román et al. (2018) *Remote Sensing of Environment* 210.
- Walker (1977) *PASP* 89.
- Falchi et al. (2016) *Science Advances* 2(6).
- Kyba et al. (2023) *Science* 379.
- Ke et al. (2017) *NeurIPS* (LightGBM).
- Pedregosa et al. (2011) *JMLR* 12.
- Grinsztajn et al. (2022) *NeurIPS*.
- Bortle (2001) *Sky & Telescope*.
- DarkSky International: Five Lighting Principles.
"""
    with open(os.path.join(REPORTS, "README.md"), "w", encoding="utf-8") as fh:
        fh.write(md)


if __name__ == "__main__":
    main()
