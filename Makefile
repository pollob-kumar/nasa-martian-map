.PHONY: demo api web test validate
demo:   ## synthetic regions (demo + Jezero + 5 Bangladesh craters) so everyone can start now
	python data/scripts/run_all.py --full-demo
api:
	cd backend && uvicorn app.main:app --reload --port 8000
web:
	cd frontend && npm install && npm run dev
test:
	cd backend && python -m pytest -q
validate: ## evidence for docs/VALIDATION.md
	python backend/scripts/validate.py
