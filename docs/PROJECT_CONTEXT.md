# Project context (what NASA asks, what we build)

**Challenge:** a layered, integrated view of a location or route on Mars, using data from several NASA missions, that helps an astronaut plan and carry out a Marswalk and do science on the way.

## MUST (build exactly this)
1. ONE real region + a clear science goal.
2. >= 3 kinds of real data layered on it: optical imagery, topography (elevation -> slope), science/geology sites (+ rover POV images).
3. Layer toggles that line up correctly (same grid).
4. Route start -> science site computed by an algorithm from the data (slope + hazards), not a drawn line.
5. Explain WHY (slope, hazards, assumptions); show source/date/resolution; show missing data as missing.
6. Astronaut-facing interface (our helmet HUD).

## OPTIONAL (only if time is left, in this order)
alternative routes (done) · travel-time with suit/cargo assumptions (done) · POV images · second region (the Bangladesh craters) · radiation/space-weather only if a real source is found.

## NOT doing
Moon/Artemis dashboard, rover control, real-time GPS, fake telemetry, comparing with other tools, ML models (unless the extra member finishes everything else).

## Region decision
- **Main region: Jezero Crater western delta.** Data-rich (HiRISE/CTX imagery + terrain models, Perseverance photos). NASA itself suggests starting data-rich.
- **Bangladesh craters** (Bogra, Srīpur, Teknaf, Ruhea, Satkania): real, IAU-approved names. But they sit in the southern highlands, 6-23 km wide, with no rover and likely only global-grade elevation (~200 m/px). A 6 km crater is ~30 cells across, so slope is too coarse for walking safety. => Use them as *extra selectable regions* ("map generator" idea, our Bangladesh story) with honest limits, NOT as the main Marswalk region.

## Layer natures shown in the UI
static (elevation, geology) · historical (orbital image, rover photo) · current / predicted (only if a real source exists; we have none yet -> never shown).
