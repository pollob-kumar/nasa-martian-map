"""Procedural Jezero-style fill layers. Used ONLY for layers whose .tif is missing, so the app is never empty.
Every filled layer is flagged origin='demo' or 'derived' in the API and shown with a badge in the UI."""
import numpy as np


def _noise(shape, beta=2.4, seed=0):
    rng = np.random.default_rng(seed)
    h, w = shape
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2)
    k[0, 0] = 1.0
    f = f / (k ** (beta / 2.0))
    f[0, 0] = 0
    out = np.real(np.fft.ifft2(f))
    out -= out.mean()
    return (out / (out.std() + 1e-9)).astype("float32")


def demo_dem(h, w, cell_m, seed=7):
    """Crater floor + rim on the west + a lobed delta fan + channels + small relief. Metres."""
    v, u = np.mgrid[0:h, 0:w].astype("float32")
    u = u / w * 2 - 1
    v = v / h * 2 - 1
    r = np.hypot(u + 0.2, v * 0.9)
    rim = 420.0 * np.exp(-((r - 1.12) / 0.3) ** 2)
    floor = -2540.0 + 14.0 * _noise((h, w), 3.4, seed)
    fan_d = np.hypot((u + 0.25) * 1.0, (v - 0.05) * 1.5)
    fan = 55.0 * np.exp(-(fan_d / 0.55) ** 2) / (1 + np.exp((u - 0.45) * 14))
    ridged = 1 - np.abs(_noise((h, w), 2.0, seed + 1))
    channels = -6.0 * np.clip(ridged - 0.8, 0, 1) * 4 * np.exp(-(fan_d / 0.6) ** 2)
    mesas = 22.0 * np.clip(_noise((h, w), 3.4, seed + 2) - 1.0, 0, 3) / (1 + np.exp(-u * 14))
    fine = 0.12 * _noise((h, w), 2.6, seed + 3)
    return (floor + rim + fan + channels + mesas + fine).astype("float32")


def slope_deg(dem, cell_m, smooth=0):
    d = dem.astype("float64")
    if smooth:
        k = np.ones(smooth) / smooth
        d = np.apply_along_axis(lambda m: np.convolve(m, k, "same"), 0, d)
        d = np.apply_along_axis(lambda m: np.convolve(m, k, "same"), 1, d)
    gy, gx = np.gradient(d, cell_m)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")


def hillshade(dem, cell_m, az=315.0, alt=38.0):
    gy, gx = np.gradient(dem.astype("float64"), cell_m)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(gy, -gx)
    azr, altr = np.radians(360 - az + 90), np.radians(alt)
    hs = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return (np.clip(hs, 0, 1) * 255).astype("uint8")


def ortho_rgb(hs, h, w, seed=11):
    """Mars-coloured photo-like texture from relief shading + albedo noise."""
    n1 = _noise((h, w), 2.6, seed)
    n2 = _noise((h, w), 1.3, seed + 1)
    t = np.clip(0.5 + 0.28 * n1, 0, 1)[..., None]
    tan, dark, light = np.array([176, 122, 84]), np.array([92, 66, 52]), np.array([212, 166, 124])
    base = np.where(t < 0.5, dark + (tan - dark) * (t / 0.5), tan + (light - tan) * ((t - 0.5) / 0.5))
    shade = 0.45 + 0.75 * (hs.astype("float32") / 255.0)[..., None]
    grain = 1 + 0.06 * n2[..., None]
    return np.clip(base * shade * grain, 0, 255).astype("uint8")


def hazard_classes(slope, seed=21):
    """1 = safer, 2 = medium risk, 3 = danger (0 = no data)."""
    rocks = _noise(slope.shape, 2.4, seed) > 2.6
    cls = np.ones(slope.shape, dtype="uint8")
    cls[(slope > 11) | (_noise(slope.shape, 3.0, seed + 1) > 1.9)] = 2
    cls[(slope > 19) | rocks] = 3
    return cls


def confidence_rgb(slope, seed=31):
    """Blue (low) -> green (high) like a FOM colour map."""
    q = np.clip(1 - slope / 30.0 + 0.12 * _noise(slope.shape, 2.4, seed), 0, 1)[..., None]
    low, high = np.array([40, 60, 170]), np.array([60, 190, 70])
    return np.clip(low + (high - low) * q, 0, 255).astype("uint8")


def chem_index(h, w, seed=41):
    n = _noise((h, w), 2.6, seed)
    v, u = np.mgrid[0:h, 0:w].astype("float32")
    fan = np.exp(-(np.hypot(u / w - 0.38, v / h - 0.52) / 0.3) ** 2)
    c = np.clip(0.35 + 0.18 * n + 0.45 * fan, 0, 1).astype("float32")
    c[_noise((h, w), 3.0, seed + 1) > 1.9] = np.nan   # coverage gaps stay honest
    return c
