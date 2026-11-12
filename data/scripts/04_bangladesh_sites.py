"""Create one 'site' per Bangladesh crater (centre point) inside its own region. Facts come from bangladesh_craters.json."""
import json
from pipeline import ROOT, PROCESSED, load_regions

info = {c["id"]: c for c in json.loads((ROOT / "data" / "bangladesh_craters.json").read_text(encoding="utf-8"))["craters"]}
regs = load_regions()
for rid, c in info.items():
    out = PROCESSED / rid
    if not (out / "meta.json").exists():
        print("skip (region not built yet):", rid); continue
    r = regs[rid]
    site = {"id": f"{rid}_centre", "name": f"{c['name']} crater centre", "lat": r["center"]["lat"], "lon": r["center"]["lon"],
            "goal": "Landmark: named after a town in Bangladesh (IAU/USGS Gazetteer)",
            "description": f"Impact crater ~{c['diameter_km']} km across; name approved {c['approved']}; named after {c['named_after']}.",
            "mission": "IAU WGPSN / USGS Gazetteer", "observed": c["approved"], "source_url": c["gazetteer"], "pov_images": []}
    (out / "sites.json").write_text(json.dumps([site], indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote site for", rid)
