"""RUN THIS FIRST on a machine with internet. Tells the data team which sources really answer."""
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import yaml
import requests
from pipeline import ROOT

cfg = yaml.safe_load((ROOT / "data" / "sources.yaml").read_text(encoding="utf-8"))
NASA_API_KEY = os.environ.get("NASA_API_KEY", "").strip()


def request_url(source: dict) -> str:
    """Add the optional NASA key only to NASA API requests."""
    url = source["url"]
    if "api.nasa.gov" not in url or not NASA_API_KEY:
        return url
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["api_key"] = NASA_API_KEY
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


bad = 0
for s in cfg["sources"]:
    try:
        r = requests.get(request_url(s), timeout=20, headers={"User-Agent": "RedNav-N399-verify"})
        ok = r.status_code < 400
        print(f"{'OK  ' if ok else 'FAIL'} {r.status_code} {s['id']:18} {s['url']}")
        bad += (not ok)
    except Exception as e:
        print(f"FAIL --- {s['id']:18} {s['url']}  ({type(e).__name__})")
        bad += 1
print("\nAll reachable." if not bad else f"\n{bad} source(s) failed -> write them in docs/DATA_SOURCES.md and use the manual-download route.")
