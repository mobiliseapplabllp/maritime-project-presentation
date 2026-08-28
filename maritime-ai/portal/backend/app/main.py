"""Sagar Drishti (Maritime AI Analytics) — FastAPI backend entrypoint."""
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles

from . import config, claude_cli
from .auth import authenticate, make_token, current_user
from .data import get_store
from .analytics import router as analytics_router
from .chat import router as chat_router
from .sections import router as sections_router
from .records import router as records_router
from .yearbook import router as yearbook_router
from .admin_users import auth_router, admin_router

app = FastAPI(title="Sagar Drishti API", version="1.0",
              description="Maritime AI Analytics backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm():
    get_store()  # load panels once at boot
    from . import agents as agent_mod
    from . import users_db
    try:
        users_db.init()
    except Exception as _e:
        print('users_db init:', _e)
    agent_mod.start_scheduler()  # 2-hourly autonomous enrichment cycle
    from . import qa as qa_mod
    qa_mod.start_qa_scheduler()   # chatbot training/validation loop (default 4x/day)
    from . import reports_db
    try:
        reports_db.init()
        reports_db.start_scheduler()  # hourly check for due report subscriptions
    except Exception as _e:
        print('reports_db init:', _e)
    from . import research
    try:
        research.init()
        research.start_scheduler()    # daily market-intelligence research run
    except Exception as _e:
        print('research init:', _e)


@app.get("/api/health")
def health():
    s = get_store()
    cli = claude_cli.available()
    return {"status": "ok", "latest_month": s.latest_month,
            "berths": int(s.meta.get("berths", 0)),
            "terminals": int(s.meta.get("terminals", 0)),
            "findings": len(s.findings),
            "llm_enabled": cli or bool(config.ANTHROPIC_API_KEY),
            "llm_backend": "claude_cli" if cli else ("anthropic_api" if config.ANTHROPIC_API_KEY else "none")}


@app.post("/api/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = authenticate(form.username, form.password)
    if not user:
        raise HTTPException(401, "Invalid username or password")
    return {"access_token": make_token(user), "token_type": "bearer", "user": user}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


app.include_router(analytics_router)
app.include_router(chat_router)
app.include_router(sections_router)
app.include_router(records_router)
app.include_router(yearbook_router)
app.include_router(auth_router)
app.include_router(admin_router)

# generated creatives (flyers/posters) — served for <img> tags in the chat
from . import creative as creative_mod
app.mount("/api/assets", StaticFiles(directory=creative_mod.ASSETS_DIR), name="assets")
