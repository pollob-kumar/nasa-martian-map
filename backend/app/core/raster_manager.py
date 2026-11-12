"""Loads the 7 GeoTIFFs lazily, reads only the window needed, caches everything.

- Files are never loaded whole: every request reads a window decimated to the output size (uses overviews).
- All layers are aligned to ONE map frame (equirectangular Mars). Layers may have different CRS / resolution.
- A missing layer is filled (derived from real data when possible, else demo) and flagged origin != 'nasa'.
"""
from __future__ import annotations
import hashlib
import json
import math
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import ColorInterp, Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds

from . import config as C
from . import decode as D
from . import demo_data as demo
from .layers import LAYERS, BY_KEY, load_overrides

R = C.MARS_RADIUS_M
PRIORITY = ["orthomosaic", "hillshade", "elevation", "hirise_slope", "secondary_slope", "hazard", "confidence"]
FILL_VERSION = 3


class Frame:
    """Equirectangular metre frame on the Mars sphere. x east, y north (absolute, y = R*lat)."""

    def __init__(self, lat0: float, lon0: float, bounds: tuple[float, float, float, float]):
        self.lat0, self.lon0 = lat0, lon0 % 360.0
        self.kx = R * math.cos(math.radians(lat0))
        self.minx, self.miny, self.maxx, self.maxy = bounds
        self.crs = CRS.from_proj4(f"+proj=eqc +lat_ts={lat0:.8f} +lat_0=0 +lon_0={self.lon0:.8f} +x_0=0 +y_0=0 +R={R} +units=m +no_defs")

    @classmethod
    def from_lonlat_bounds(cls, west, south, east, north):
        lat0, lon0 = (south + north) / 2, (west + east) / 2
        tmp = cls(lat0, lon0, (0, 0, 0, 0))
        x0, y0 = tmp.to_xy(south, west)
        x1, y1 = tmp.to_xy(north, east)
        tmp.minx, tmp.maxx = min(x0, x1), max(x0, x1)
        tmp.miny, tmp.maxy = min(y0, y1), max(y0, y1)
        return tmp

    @property
    def width_m(self): return self.maxx - self.minx
    @property
    def height_m(self): return self.maxy - self.miny
    @property
    def bounds(self): return (self.minx, self.miny, self.maxx, self.maxy)

    def to_xy(self, lat, lon):
        d = ((lon - self.lon0 + 180.0) % 360.0) - 180.0
        return math.radians(d) * self.kx, math.radians(lat) * R

    def to_latlon(self, x, y):
        return math.degrees(y / R), (self.lon0 + math.degrees(x / self.kx)) % 360.0


@dataclass
class LayerInfo:
    key: str
    path: Path
    origin: str                    # nasa | derived | demo
    mode: str                      # crs | linear
    width: int
    height: int
    count: int
    dtype: str
    nodata: float | None
    has_alpha: bool
    res_m: float
    overviews: int
    fb: tuple                      # layer extent in frame metres (minx, miny, maxx, maxy)
    crs_text: str = ""
    size_mb: float = 0.0
    proxy: Path | None = None       # fast reduced copy (built once, lives in the cache folder)
    proxy_res_m: float = 0.0


def _lon360(v): return v % 360.0


class RasterManager:
    def __init__(self):
        self._lock = threading.RLock()
        self.overrides = load_overrides()
        self.infos: dict[str, LayerInfo] = {}
        self.frame: Frame | None = None
        self._stats: dict[str, dict] = {}
        self.notes: list[str] = []
        self._scan()

    # ------------------------------------------------------------------ scan
    def _probe(self, path: Path):
        try:
            with rasterio.open(path) as ds:
                ci = list(ds.colorinterp)
                alpha = ColorInterp.alpha in ci
                crs = ds.crs
                res = min(abs(ds.res[0]), abs(ds.res[1]))
                lonlat = None
                mode = "linear"
                if crs is not None and crs.is_geographic:
                    b = ds.bounds
                    lonlat = (_lon360(b.left), b.bottom, _lon360(b.left) + (b.right - b.left), b.top)
                    res = res * math.pi / 180 * R
                elif crs is not None:
                    try:
                        geo_crs = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
                        b = transform_bounds(crs, geo_crs, *ds.bounds, densify_pts=21)
                        lonlat = (_lon360(b[0]), b[1], _lon360(b[0]) + (b[2] - b[0]), b[3])
                        mode = "crs"
                        f = crs.linear_units_factor[1] if crs.linear_units_factor else 1.0
                        res = res * (f or 1.0)
                    except Exception:
                        lonlat = None
                return dict(width=ds.width, height=ds.height, count=ds.count, dtype=ds.dtypes[0], nodata=ds.nodata,
                            alpha=alpha, res=res, bounds=tuple(ds.bounds), lonlat=lonlat, mode=mode,
                            ovr=len(ds.overviews(1)), crs=(crs.to_string()[:60] if crs else "none"),
                            geographic=bool(crs is not None and crs.is_geographic))
        except Exception as e:  # unreadable file => treated as missing
            self.notes.append(f"{path.name}: could not open ({e})")
            return None

    def _scan(self):
        with self._lock:
            self.infos.clear(); self._stats.clear(); self.notes = []
            raw = {}
            for l in LAYERS:
                p = C.RASTER_DIR / l.filename
                if p.exists():
                    pr = self._probe(p)
                    if pr:
                        raw[l.key] = (p, pr)
            self.frame = self._make_frame(raw)
            for k, (p, pr) in raw.items():
                self.infos[k] = self._info(k, p, pr, "nasa")
            self._build_proxies()
            self._fill_missing()

    def _make_frame(self, raw) -> Frame:
        ref = next((k for k in PRIORITY if k in raw), None)
        if ref is None:
            la, lo = C.DEMO_CENTER
            h = C.DEMO_FRAME_KM * 500.0
            tmp = Frame(la, lo, (0, 0, 0, 0))
            cx, cy = tmp.to_xy(la, lo)
            return Frame(la, lo, (cx - h, cy - h, cx + h, cy + h))
        pr = raw[ref][1]
        if pr["lonlat"]:
            w, s, e, n = pr["lonlat"]
            return Frame.from_lonlat_bounds(w, s, e, n)
        # no usable georeference: assume metres, put it at the default Jezero centre
        la, lo = C.DEMO_CENTER
        b = pr["bounds"]
        tmp = Frame(la, lo, (0, 0, 0, 0))
        cx, cy = tmp.to_xy(la, lo)
        hw, hh = (b[2] - b[0]) / 2, (b[3] - b[1]) / 2
        self.notes.append(f"{ref}: no usable georeference - assumed metres, centred on Jezero. Add a CRS for exact positions.")
        return Frame(la, lo, (cx - hw, cy - hh, cx + hw, cy + hh))

    def _info(self, key, path, pr, origin) -> LayerInfo:
        f = self.frame
        if pr["lonlat"]:
            w, s, e, n = pr["lonlat"]
            x0, y0 = f.to_xy(s, w); x1, y1 = f.to_xy(n, e)
            fb = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        else:
            fb = f.bounds
        mode = pr["mode"]
        return LayerInfo(key, path, origin, mode, pr["width"], pr["height"], pr["count"], pr["dtype"], pr["nodata"],
                         pr["alpha"], pr["res"], pr["ovr"], fb, pr["crs"], path.stat().st_size / 1e6)

    # ---------------------------------------------------------------- fill
    def _sig(self) -> str:
        parts = [str(FILL_VERSION), json.dumps(self.frame.bounds), str(C.DEMO_MAX_PX)]
        for k, i in sorted(self.infos.items()):
            if i.origin == "nasa":
                st = i.path.stat()
                parts.append(f"{k}:{st.st_size}:{int(st.st_mtime)}")
        parts.append(json.dumps(self.overrides, sort_keys=True))
        return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]

    def grid_wh(self, max_px: int):
        W, H = self.frame.width_m, self.frame.height_m
        k = max_px / max(W, H)
        return max(8, int(round(W * k))), max(8, int(round(H * k)))

    def _fill_missing(self):
        missing = [l.key for l in LAYERS if l.key not in self.infos]
        fill_dir = C.CACHE_DIR / "fill"
        fill_dir.mkdir(parents=True, exist_ok=True)
        sigf = fill_dir / "signature.json"
        want = {"sig": self._sig(), "missing": missing}
        cached_ok = False
        if sigf.exists():
            try:
                cached_ok = json.loads(sigf.read_text()) == want and all((fill_dir / f"{k}.tif").exists() for k in missing)
            except Exception:
                cached_ok = False
        real_elev = "elevation" in self.infos
        origin = "derived" if real_elev else "demo"
        if missing and not cached_ok:
            w, h = self.grid_wh(C.DEMO_MAX_PX)
            cell = self.frame.width_m / w
            if real_elev:
                dem = self._read_float("elevation", self.frame.bounds, w, h, Resampling.average)
                if np.isnan(dem).all():
                    dem = demo.demo_dem(h, w, cell)
                else:
                    dem = np.where(np.isnan(dem), np.nanmedian(dem), dem).astype("float32")
            else:
                dem = demo.demo_dem(h, w, cell)
            arrs = {}
            arrs["elevation"] = (dem[None], np.float32, np.nan)
            slope = None
            if "hirise_slope" in self.infos:
                raw, valid = self.read("hirise_slope", self.frame.bounds, w, h, Resampling.average)
                slope, _ = D.decode_slope(raw[0], valid, self.overrides.get("hirise_slope"))
                slope = np.where(np.isnan(slope), demo.slope_deg(dem, cell), slope)
            if slope is None:
                slope = demo.slope_deg(dem, cell)
            arrs["hirise_slope"] = (slope[None], np.float32, np.nan)
            arrs["secondary_slope"] = (demo.slope_deg(dem, cell, smooth=3)[None], np.float32, np.nan)
            hs = demo.hillshade(dem, cell)
            arrs["hillshade"] = (hs[None], np.uint8, None)
            arrs["orthomosaic"] = (np.moveaxis(demo.ortho_rgb(hs, h, w), -1, 0), np.uint8, None)
            arrs["hazard"] = (demo.hazard_classes(slope)[None], np.uint8, 0)
            arrs["confidence"] = (np.moveaxis(demo.confidence_rgb(slope), -1, 0), np.uint8, None)
            for k in missing:
                data, dt, nd = arrs[k]
                self._write_tif(fill_dir / f"{k}.tif", data.astype(dt), nd)
            chem = demo.chem_index(h, w)
            np.save(fill_dir / "chem.npy", chem)
            sigf.write_text(json.dumps(want))
        for k in missing:
            p = fill_dir / f"{k}.tif"
            pr = self._probe(p)
            if pr:
                self.infos[k] = self._info(k, p, pr, origin)
                self.infos[k].res_m = max(self.infos[k].res_m, 0.0)

    def _write_tif(self, path: Path, data, nodata):
        n, h, w = data.shape
        tr = from_bounds(*self.frame.bounds, w, h)
        with rasterio.open(path, "w", driver="GTiff", height=h, width=w, count=n, dtype=data.dtype, crs=self.frame.crs,
                           transform=tr, tiled=True, blockxsize=256, blockysize=256, compress="deflate", nodata=nodata) as d:
            d.write(data)
            if n == 3 and data.dtype == np.uint8:
                d.colorinterp = [ColorInterp.red, ColorInterp.green, ColorInterp.blue]
        with rasterio.open(path, "r+") as d:
            d.build_overviews([2, 4, 8], Resampling.average)

    def chem(self):
        p = C.CACHE_DIR / "fill" / "chem.npy"
        return np.load(p) if p.exists() else None

    # ------------------------------------------------------- fast reduced copies (speed)
    PROXY_PX = 4096

    def _proxy_path(self, i: LayerInfo) -> Path:
        st = i.path.stat()
        h = hashlib.sha1(f"{i.path.resolve()}:{st.st_size}:{int(st.st_mtime)}".encode()).hexdigest()[:10]
        return C.CACHE_DIR / "proxy" / f"{i.key}_{h}.tif"

    def _build_proxies(self):
        """Huge files (> 4096 px) get a 4096-px reduced copy in the cache folder (your originals are never touched).
        Zoomed-out views, statistics and the route grid read the small copy; zoomed-in views read the original window."""
        todo = [i for i in self.infos.values() if i.origin == "nasa" and max(i.width, i.height) > self.PROXY_PX * 1.5]
        if not todo or not C.AUTO_OVERVIEWS:
            return
        (C.CACHE_DIR / "proxy").mkdir(parents=True, exist_ok=True)

        def one(i: LayerInfo):
            out = self._proxy_path(i)
            f = math.ceil(max(i.width, i.height) / self.PROXY_PX)
            if not out.exists():
                print(f"[rednav] preparing a fast copy of {i.path.name} (one time only) ...", flush=True)
                tmp = out.with_suffix(".part")
                try:
                    with rasterio.open(i.path) as ds:
                        w, h = math.ceil(ds.width / f), math.ceil(ds.height / f)
                        rs = Resampling.nearest if BY_KEY[i.key].kind == "hazard" else Resampling.average
                        data = ds.read(out_shape=(ds.count, h, w), resampling=rs)
                        prof = dict(driver="GTiff", height=h, width=w, count=ds.count, dtype=ds.dtypes[0], crs=ds.crs,
                                    transform=ds.transform * rasterio.Affine.scale(ds.width / w, ds.height / h), nodata=ds.nodata,
                                    tiled=True, blockxsize=256, blockysize=256, compress="deflate")
                    with rasterio.open(tmp, "w", **prof) as dst:
                        dst.write(data)
                    with rasterio.open(tmp, "r+") as dst:
                        dst.build_overviews([2, 4, 8], Resampling.average)
                    tmp.replace(out)
                except Exception as e:
                    self.notes.append(f"{i.path.name}: fast copy failed ({e})")
                    tmp.unlink(missing_ok=True)
                    return
            i.proxy = out
            i.proxy_res_m = i.res_m * f

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as ex:
            list(ex.map(one, todo))

    # ----------------------------------------------------------------- reads
    def has(self, key) -> bool: return key in self.infos

    def _band_count(self, i: LayerInfo) -> int:
        return i.count - 1 if (i.has_alpha and i.count > 1) else i.count

    def read(self, key, bounds, w, h, resampling=Resampling.bilinear):
        """-> (data float32 [bands,h,w], valid bool [h,w]) for `bounds` (frame metres) decimated to w x h."""
        i = self.infos[key]
        nb = self._band_count(i)
        minx, miny, maxx, maxy = bounds
        src = i.proxy if (i.proxy and (maxx - minx) / max(w, 1) >= i.proxy_res_m * 0.8) else i.path
        try:
            if i.mode == "crs":
                tr = from_bounds(minx, miny, maxx, maxy, w, h)
                with rasterio.open(src) as ds:
                    kw = dict(crs=self.frame.crs, transform=tr, width=w, height=h, resampling=resampling)
                    if ds.nodata is None:
                        kw["init_dest_nodata"] = False
                    vrt = WarpedVRT(ds, **kw) if i.has_alpha else WarpedVRT(ds, add_alpha=True, src_nodata=ds.nodata, **kw)
                    with vrt:
                        arr = vrt.read(out_dtype="float32")
                data = arr[:nb]
                valid = arr[-1] > 0
            else:
                lx0, ly0, lx1, ly1 = i.fb
                with rasterio.open(src) as ds:
                    c0 = (minx - lx0) / (lx1 - lx0) * ds.width
                    c1 = (maxx - lx0) / (lx1 - lx0) * ds.width
                    r0 = (ly1 - maxy) / (ly1 - ly0) * ds.height
                    r1 = (ly1 - miny) / (ly1 - ly0) * ds.height
                    win = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0)
                    m = ds.read(indexes=list(range(1, nb + 1)), window=win, out_shape=(nb, h, w), boundless=True,
                                resampling=resampling, masked=True)
                data = np.ma.filled(m.astype("float32"), 0.0)
                valid = ~np.ma.getmaskarray(m).any(axis=0)
        except Exception as e:
            self.notes.append(f"{key}: read failed ({e})")
            return np.zeros((nb, h, w), "float32"), np.zeros((h, w), bool)
        if data.dtype.kind == "f":
            valid = valid & np.isfinite(data).all(axis=0) & (np.abs(data) < 1e30).all(axis=0)
        return data, valid

    def _read_float(self, key, bounds, w, h, rs):
        d, v = self.read(key, bounds, w, h, rs)
        a = d[0].copy()
        a[~v] = np.nan
        return a

    def sample(self, key, lat, lon):
        """Native-resolution value at a point -> (list of band values, valid)."""
        i = self.infos[key]
        x, y = self.frame.to_xy(lat, lon)
        if not (i.fb[0] <= x <= i.fb[2] and i.fb[1] <= y <= i.fb[3]):
            return None, False
        half = max(i.res_m, 0.05) / 2
        d, v = self.read(key, (x - half, y - half, x + half, y + half), 1, 1, Resampling.nearest)
        return [float(b[0, 0]) for b in d], bool(v[0, 0])

    # ------------------------------------------------------------------ stats
    def stats(self, key) -> dict:
        if key in self._stats:
            return self._stats[key]
        i = self.infos[key]
        w, h = self.grid_wh(512)
        d, v = self.read(key, self.frame.bounds, w, h, Resampling.nearest)
        a = d[0][v] if v.any() else np.array([0.0])
        a = a[np.isfinite(a)]
        st = {"min": float(a.min()), "max": float(a.max()), "p2": float(np.percentile(a, 2)), "p98": float(np.percentile(a, 98)),
              "valid_pct": round(float(v.mean() * 100), 1), "unique": None}
        if a.size:
            u = np.unique(a[:: max(1, a.size // 200000)])
            if len(u) <= 12:
                st["unique"] = [float(x) for x in u]
        if d.shape[0] >= 3 and d.dtype.kind == "f":
            st["rgb"] = True
        self._stats[key] = st
        return st

    # ------------------------------------------------------------------ tiles
    def max_zoom(self) -> int:
        best = min([max(i.res_m, 0.25) for i in self.infos.values() if i.origin == "nasa"] or [8.0])
        size = max(self.frame.width_m, self.frame.height_m)
        return int(max(2, min(10, math.ceil(math.log2(size / (C.TILE_SIZE * max(best, 0.5)))))))

    def tile_bounds(self, z, x, y):
        size = max(self.frame.width_m, self.frame.height_m)
        t = size / (2 ** z)
        minx = self.frame.minx + x * t
        maxy = self.frame.maxy - y * t
        return (minx, maxy - t, minx + t, maxy)


_mgr: RasterManager | None = None
_mgr_lock = threading.Lock()


def get_manager() -> RasterManager:
    global _mgr
    with _mgr_lock:
        if _mgr is None:
            _mgr = RasterManager()
        return _mgr


def reset_manager():
    global _mgr
    with _mgr_lock:
        _mgr = None
    for fn in (lambda: __import__("app.services.visualization_service", fromlist=["x"]).clear_caches(),):
        try:
            fn()
        except Exception:
            pass
