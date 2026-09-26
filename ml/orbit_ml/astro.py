"""Sun & Moon position / illumination (vectorised numpy port of SunCalc).

The same formulas are implemented in src/modules/astro.js so the website
computes exactly the same features as the training pipeline.
Accuracy: ~0.5 deg for the Sun, ~1 deg for the Moon — more than enough
to decide "is the Moon up and how bright is it".
"""
import numpy as np

RAD = np.pi / 180.0
J1970 = 2440588.0
J2000 = 2451545.0
OBLIQUITY = RAD * 23.4397


def to_days(unix_seconds):
    """Days since J2000 from unix time (seconds)."""
    return np.asarray(unix_seconds, dtype=float) / 86400.0 - 0.5 + J1970 - J2000


def _right_ascension(l, b):
    return np.arctan2(np.sin(l) * np.cos(OBLIQUITY) - np.tan(b) * np.sin(OBLIQUITY), np.cos(l))


def _declination(l, b):
    return np.arcsin(np.sin(b) * np.cos(OBLIQUITY) + np.cos(b) * np.sin(OBLIQUITY) * np.sin(l))


def _altitude(H, phi, dec):
    return np.arcsin(np.sin(phi) * np.sin(dec) + np.cos(phi) * np.cos(dec) * np.cos(H))


def _sidereal_time(d, lw):
    return RAD * (280.16 + 360.9856235 * d) - lw


def _sun_coords(d):
    M = RAD * (357.5291 + 0.98560028 * d)
    C = RAD * (1.9148 * np.sin(M) + 0.02 * np.sin(2 * M) + 0.0003 * np.sin(3 * M))
    L = M + C + RAD * 102.9372 + np.pi
    return _right_ascension(L, 0.0), _declination(L, 0.0)


def _moon_coords(d):
    L = RAD * (218.316 + 13.176396 * d)
    M = RAD * (134.963 + 13.064993 * d)
    F = RAD * (93.272 + 13.229350 * d)
    lon = L + RAD * 6.289 * np.sin(M)
    lat = RAD * 5.128 * np.sin(F)
    dist = 385001.0 - 20905.0 * np.cos(M)
    return _right_ascension(lon, lat), _declination(lon, lat), dist


def sun_altitude_deg(unix_seconds, lat, lon):
    d = to_days(unix_seconds)
    ra, dec = _sun_coords(d)
    H = _sidereal_time(d, RAD * -np.asarray(lon)) - ra
    return _altitude(H, RAD * np.asarray(lat), dec) / RAD


def moon_altitude_deg(unix_seconds, lat, lon):
    d = to_days(unix_seconds)
    ra, dec, _ = _moon_coords(d)
    H = _sidereal_time(d, RAD * -np.asarray(lon)) - ra
    return _altitude(H, RAD * np.asarray(lat), dec) / RAD


def moon_illumination(unix_seconds):
    """Illuminated fraction of the Moon (0 = new, 1 = full)."""
    d = to_days(unix_seconds)
    s_ra, s_dec = _sun_coords(d)
    m_ra, m_dec, m_dist = _moon_coords(d)
    sdist = 149598000.0
    phi = np.arccos(np.clip(np.sin(s_dec) * np.sin(m_dec) +
                            np.cos(s_dec) * np.cos(m_dec) * np.cos(s_ra - m_ra), -1, 1))
    inc = np.arctan2(sdist * np.sin(phi), m_dist - sdist * np.cos(phi))
    return (1 + np.cos(inc)) / 2.0
