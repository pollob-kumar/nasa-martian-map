"""Merge science sites + analyst hazards + POV images into sites.json / hazards.json for a region.

Team-edited inputs (CSV, easy for non-coders; keep one row per item and ALWAYS fill source_url):
  data/inputs/<region>/sites.csv    id,name,lat,lon,goal,description,mission,observed,source_url
  data/inputs/<region>/hazards.csv  id,name,lat,lon,radius_m,reason,source_url      (marked from HiRISE/CTX by a human)
  data/inputs/<region>/pov.csv      site_id,file_or_url,rover,camera,sol,earth_date,credit,source_url
POV rule from the NASA brief: only attach an image to a site if the rover photo really was taken THERE (distance_m column optional).
"""
import argparse, csv, json, shutil
from pathlib import Path
import requests
from pipeline import ROOT, PROCESSED


def rows(p: Path):
    return list(csv.DictReader(p.open(encoding="utf-8"))) if p.exists() else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", required=True)
    a = ap.parse_args()
    inp, out = ROOT / "data" / "inputs" / a.region, PROCESSED / a.region
    if not (out / "meta.json").exists():
        raise SystemExit("Build the region first: 02_build_region.py")
    sites = [{"id": r["id"], "name": r["name"], "lat": float(r["lat"]), "lon": float(r["lon"]), "goal": r["goal"],
              "description": r["description"], "mission": r["mission"], "observed": r["observed"],
              "source_url": r["source_url"], "pov_images": []} for r in rows(inp / "sites.csv")]
    by_id = {s["id"]: s for s in sites}
    (out / "media").mkdir(exist_ok=True)
    for i, r in enumerate(rows(inp / "pov.csv")):
        s = by_id.get(r["site_id"])
        if not s:
            print("WARN pov for unknown site", r["site_id"]); continue
        src = r["file_or_url"]
        fname = f"{r['site_id']}_{i}{Path(src).suffix or '.jpg'}"
        if src.startswith("http"):
            (out / "media" / fname).write_bytes(requests.get(src, timeout=60).content)
        else:
            shutil.copy(ROOT / src, out / "media" / fname)
        s["pov_images"].append({"url": f"/api/regions/{a.region}/media/{fname}", "rover": r["rover"], "camera": r["camera"],
                                "sol": r["sol"], "earth_date": r["earth_date"], "credit": r["credit"], "source_url": r["source_url"]})
    hazards = [{"id": r["id"], "name": r["name"], "lat": float(r["lat"]), "lon": float(r["lon"]), "radius_m": float(r["radius_m"]),
                "reason": r["reason"], "source_url": r["source_url"]} for r in rows(inp / "hazards.csv")]
    (out / "sites.json").write_text(json.dumps(sites, indent=2, ensure_ascii=False), encoding="utf-8")
    (out / "hazards.json").write_text(json.dumps(hazards, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{a.region}: {len(sites)} sites, {len(hazards)} hazards, {sum(len(s['pov_images']) for s in sites)} POV images")


if __name__ == "__main__":
    main()
