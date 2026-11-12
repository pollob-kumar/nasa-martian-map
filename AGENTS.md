# Rules for any AI agent / contributor
1. Read README.md, docs/PROJECT_CONTEXT.md, docs/API_SPEC.md first.
2. Scope = the MUST list only. No extra features.
3. Never invent NASA data or numbers. Missing -> show "MISSING". Synthetic data must carry `synthetic:true`.
4. Every layer/site needs source + date + resolution (provenance) in meta.json / sites.json.
5. Thresholds and speeds are assumptions: keep them in backend/app/config.py and show them in the UI.
6. Wording: "below the slope limit in the data used", never "safe".
7. Keep the visual theme (dark, red/cyan HUD, Orbitron/JetBrains Mono).
8. Before finishing: `make test`, `cd frontend && npx tsc --noEmit && npm run build`.
