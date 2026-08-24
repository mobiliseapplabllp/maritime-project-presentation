# Sagar Drishti — full-stack portal (Mundra Port AI Analytics)
# Backend: FastAPI on :8010   Frontend: Vite/React on :5273

.PHONY: help install backend frontend dev stop tts

help:
	@echo "make install   — install backend (pip) + frontend (npm) deps"
	@echo "make dev       — run backend + frontend together (Ctrl-C to stop)"
	@echo "make backend   — run only the FastAPI backend (:8010)"
	@echo "make frontend  — run only the Vite dev server (:5273)"
	@echo "make tts       — run the Sagar Neural voice engine (:8020, optional)"
	@echo "make stop      — kill any running portal servers"
	@echo ""
	@echo "Then open http://localhost:5273  ·  demo login: harbour.master / Mundra@2026"
	@echo "Optional: export ANTHROPIC_API_KEY=... before 'make dev' to enable the LLM chatbot."

install:
	python3 -m pip install --user -r backend/requirements.txt
	cd frontend && npm install

backend:
	cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

frontend:
	cd frontend && npm run dev

# Sagar Neural voice engine (Kokoro sidecar) — human-quality en/hi voices
tts:
	cd backend && ./tts_venv/bin/python tts_server.py

# Run both; frontend in background, backend in foreground (Ctrl-C stops backend, trap stops both)
dev:
	@echo "Starting Sagar Drishti — http://localhost:5273 (login: harbour.master / Mundra@2026)"
	@cd frontend && npm run dev > /tmp/sagar_vite.log 2>&1 &
	@if [ -x backend/tts_venv/bin/python ]; then \
	  (cd backend && ./tts_venv/bin/python tts_server.py > /tmp/sagar_tts.log 2>&1 &) ; \
	  echo "Sagar Neural voice engine starting on :8020" ; fi
	@cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8010

stop:
	-pkill -f "uvicorn app.main:app" 2>/dev/null || true
	-pkill -f "vite" 2>/dev/null || true
	-pkill -f "tts_server.py" 2>/dev/null || true
	@echo "stopped"
