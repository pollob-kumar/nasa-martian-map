"""One command for the whole pipeline:  python data/scripts/run_all.py --region jezero_delta   |  --demo  |  --all"""
import argparse, subprocess, sys
from pathlib import Path
from pipeline import load_regions

H = Path(__file__).parent
ap = argparse.ArgumentParser()
ap.add_argument("--region"); ap.add_argument("--demo", action="store_true"); ap.add_argument("--jezero-demo", action="store_true"); ap.add_argument("--all", action="store_true"); ap.add_argument("--bd-demo", action="store_true"); ap.add_argument("--full-demo", action="store_true", help="demo_synthetic + Jezero demo + 5 Bangladesh craters (everything the UI needs)")
a = ap.parse_args()
py = sys.executable


def run(*args):
    print("\n>>", " ".join(args)); r = subprocess.run([py, *args], cwd=H)
    if r.returncode: sys.exit(r.returncode)


if a.demo:
    run("make_demo_region.py")
if a.jezero_demo or a.full_demo:
    run("make_jezero_demo.py")
if a.full_demo:
    run("make_demo_region.py")
if a.bd_demo or a.full_demo:
    run("make_bangladesh_demo.py")
ids = list(load_regions()) if a.all else ([a.region] if a.region else [])
for rid in ids:
    run("02_build_region.py", "--region", rid)
    if rid.startswith("bd_"):
        run("04_bangladesh_sites.py")
    else:
        run("03_build_sites.py", "--region", rid)
if not (a.demo or a.jezero_demo or a.bd_demo or a.full_demo or ids):
    ap.print_help()
