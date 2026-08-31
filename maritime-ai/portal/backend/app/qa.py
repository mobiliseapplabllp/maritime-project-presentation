"""Chatbot training & correction loop — Examiner + Validator agents.

The cycle (default 4×/day, configurable):
  1. EXAMINER generates leader-style questions (varied topics, avoids repeats).
  2. Each question is put to the REAL chatbot pipeline (builtin → LLM+SQL).
  3. VALIDATOR independently verifies each answer against the analytics-store
     ground truth (it writes its own verification SQL), scores it, and — on
     failure — writes a CORRECTION and a LESSON.
  4. Lessons persist and are injected into the chatbot/voice system prompts on
     every future request: the practical reinforcement loop for a frozen LLM.

State: agent_state/qa_history.json (audit trail), qa_lessons.json (the learned
memory), qa_config.json. Examiner/Validator appear on the Agent Operations page
via their standard agent memory files.
"""
import datetime as dt
import json
import os
import re
import threading

from . import claude_cli, config, pg_query

_STATE = os.path.abspath(config.AGENT_STATE_DIR)
os.makedirs(_STATE, exist_ok=True)
_HIST = os.path.join(_STATE, "qa_history.json")
_LESSONS = os.path.join(_STATE, "qa_lessons.json")
_CFG = os.path.join(_STATE, "qa_config.json")
_lock = threading.Lock()

DEFAULT_CFG = {"enabled": True, "interval_minutes": 30, "questions_per_cycle": 2}


def get_cfg():
    try:
        saved = json.load(open(_CFG))
    except Exception:
        saved = {}
    cfg = {**DEFAULT_CFG, **saved}
    if "interval_minutes" not in cfg and cfg.get("interval_hours"):
        cfg["interval_minutes"] = int(cfg["interval_hours"]) * 60
    cfg["interval_minutes"] = min(1440, max(5, int(cfg.get("interval_minutes", 5))))
    cfg.pop("interval_hours", None)
    cfg["questions_per_cycle"] = min(8, max(2, int(cfg.get("questions_per_cycle", 4))))
    return cfg


def set_cfg(patch):
    cfg = {**get_cfg(), **(patch or {})}
    json.dump(cfg, open(_CFG, "w"), indent=1)
    return get_cfg()


def _load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


_RULEBOOK = os.path.join(_STATE, "qa_rulebook.json")


def get_lessons(top=6):
    """The distilled rulebook (all durable rules) + the freshest raw corrections.

    Raw lessons accumulate faster than a prompt can carry; a consolidation pass
    distills them into <=12 durable rules so no validated correction is lost."""
    rules = _load(_RULEBOOK, [])
    fresh = [x["lesson"] for x in _load(_LESSONS, [])[-2:]]
    return rules + [f for f in fresh if f not in rules]


def consolidate_lessons():
    """Distill every raw lesson into <=12 durable rules (runs after cycles when
    the raw pile has grown; keeps the chatbot's learned memory complete AND small)."""
    lessons = _load(_LESSONS, [])
    if len(lessons) < 8 or not claude_cli.available():
        return None
    old_rules = _load(_RULEBOOK, [])
    raw = claude_cli.complete(
        "EXISTING RULES:\n" + json.dumps(old_rules, ensure_ascii=False) +
        "\n\nNEW RAW LESSONS (from answer validation):\n" +
        json.dumps([x["lesson"] for x in lessons], ensure_ascii=False)[:14000] +
        "\n\nMerge everything into AT MOST 12 durable, non-overlapping instructions for the "
        "chatbot (each one sentence, imperative, specific to this platform's data semantics — "
        "keep the most transferable, drop one-off trivia). Output ONLY a JSON array of strings.",
        system="You maintain the learned rulebook of an analytics chatbot. Be ruthless about "
               "merging duplicates and keeping only durable, high-value rules.",
        model=config.AGENT_MODEL, timeout=180)
    m = re.search(r"\[.*\]", raw or "", re.S)
    if not m:
        return None
    try:
        rules = [str(x) for x in json.loads(m.group(0))][:12]
    except Exception:
        return None
    with _lock:
        json.dump(rules, open(_RULEBOOK, "w"), ensure_ascii=False, indent=1)
    return rules


def qa_status():
    hist = _load(_HIST, [])
    lessons = _load(_LESSONS, [])
    recent = hist[-40:]
    n = len(recent)
    passed = sum(1 for h in recent if h.get("verdict") == "PASS")
    by_verdict = {}
    for h in hist:
        v = h.get("verdict") or "SKIP"
        by_verdict[v] = by_verdict.get(v, 0) + 1
    cycles = {}
    for h in hist:
        c = cycles.setdefault(h.get("cycle"), {"cycle": h.get("cycle"), "t": h.get("t"),
                                               "tested": 0, "pass": 0, "partial": 0, "fail": 0,
                                               "scores": []})
        c["tested"] += 1
        v = (h.get("verdict") or "").upper()
        if v == "PASS":
            c["pass"] += 1
        elif v == "PARTIAL":
            c["partial"] += 1
        elif v == "FAIL":
            c["fail"] += 1
        if isinstance(h.get("score"), (int, float)):
            c["scores"].append(h["score"])
    series = []
    for c in sorted(cycles.values(), key=lambda x: x["cycle"] or ""):
        graded = c["pass"] + c["partial"] + c["fail"]
        series.append({"cycle": c["cycle"], "t": c["t"], "tested": c["tested"],
                       "pass": c["pass"], "partial": c["partial"], "fail": c["fail"],
                       "pass_rate": round(100.0 * c["pass"] / graded, 1) if graded else None,
                       "avg_score": round(sum(c["scores"]) / len(c["scores"]), 1) if c["scores"] else None})
    return {"config": get_cfg(), "cycles_recorded": len(cycles),
            "questions_tested": len(hist),
            "by_verdict": by_verdict,
            "corrections_made": len(lessons),
            "recent_pass_rate": round(100.0 * passed / n, 1) if n else None,
            "cycles": series[-40:],
            "recent": recent[::-1][:25], "lessons": lessons[::-1]}


_EXAMINER_SYS = (
    "You are the EXAMINER agent inside Sagar Drishti (Maritime AI Analytics). Your job: write "
    "realistic questions that a real harbour master, terminal manager, HSE chief or finance "
    "controller would actually type into this platform — the kind of thing a busy person asks in "
    "one plain sentence. Vary the topic across: vessel traffic and cargo throughput, turnaround "
    "and anchorage waiting time, berth occupancy, HSE incidents and near-misses, inspections/"
    "findings/detentions, the vessel watchlist, billing and outstanding receivables, a terminal "
    "or berth, a vessel type. "
    "RULES: exactly ONE clear ask per question; everyday business language, not database jargon; "
    "keep it short — a single sentence, no multi-part 'and also…' chains, no question that asks the "
    "reader to compute several things at once. Each must be answerable from the platform's data. "
    "Favour the questions leaders really ask — e.g. 'Which terminals had the longest waits last "
    "month?', 'How many detentions did we record this year?', 'Which vessels top the watchlist?', "
    "'What is the outstanding receivable at CT-4?' — over contrived analytical puzzles. "
    "Output ONLY a JSON array of question strings, nothing else.")

_VALIDATOR_SYS = (
    "You are the VALIDATOR agent inside Sagar Drishti (Maritime AI Analytics). You receive a "
    "QUESTION and the CHATBOT'S ANSWER. Verify the answer against the ground-truth data yourself.\n"
    "Step 1 — reply with ONLY a ```sql block of 1-2 SQLite SELECTs that fetch the ground truth "
    "(filter one hierarchy level; the port row already contains every zone/terminal/berth).\n"
    "Step 2 — after receiving SQL RESULTS, reply with ONLY JSON:\n"
    '{"verdict":"PASS|PARTIAL|FAIL","score":0-10,"expected":"the true figure(s), brief",'
    '"correction":"what the answer should have said (empty if PASS)",'
    '"lesson":"one transferable instruction for the chatbot to avoid this class of error (empty if PASS)"}\n'
    "FAIL = materially wrong numbers/entities. PARTIAL = right direction, imprecise or incomplete. "
    "PASS = numbers match ground truth within rounding. Judge numbers, not style.\n\n"
    + pg_query.SCHEMA_DOC)


def _mem_update(aid, summary):
    path = os.path.join(_STATE, f"{aid}.json")
    mem = _load(path, {"runs": [], "baseline": {}, "last_run": None})
    now = dt.datetime.now().isoformat(timespec="seconds")
    mem["last_run"] = now
    mem["runs"] = (mem.get("runs", []) + [{"at": now, "summary": summary}])[-20:]
    json.dump(mem, open(path, "w"), indent=1, default=str)


def _extract_json(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _extract_sql(text):
    m = re.search(r"```sql\s*(.*?)```", text or "", re.S | re.I)
    if not m:
        return None
    return [x.strip() for x in m.group(1).split(";") if x.strip()][:2]


def run_qa_cycle(trigger="scheduled"):
    """One full Examiner → Chatbot → Validator cycle. Returns the cycle summary."""
    from .chat import builtin_answer, llm_answer
    if not claude_cli.available():
        return {"error": "LLM engine offline"}
    cfg = get_cfg()
    cycle_id = dt.datetime.now().strftime("%Y%m%d-%H%M")
    user = {"username": "qa", "name": "QA Loop", "scope": "port", "persona": "operator",
            "org": "Port Authority"}

    hist = _load(_HIST, [])
    recent_qs = [h["question"] for h in hist[-30:]]
    prompt = ("Recently asked (do NOT repeat or trivially rephrase):\n"
              + json.dumps(recent_qs[-15:], ensure_ascii=False)
              + f"\n\nWrite {cfg['questions_per_cycle']} NEW questions.")
    raw = claude_cli.complete(prompt, system=_EXAMINER_SYS, model="haiku", timeout=90)
    try:
        questions = json.loads(re.search(r"\[.*\]", raw, re.S).group(0))[:cfg["questions_per_cycle"]]
    except Exception:
        return {"error": "examiner produced no questions", "raw": (raw or "")[:200]}
    _mem_update("examiner", f"Cycle {cycle_id}: wrote {len(questions)} leadership questions")

    results = []
    for q in questions:
        # the real chatbot pipeline
        try:
            ans = builtin_answer(q, user) or llm_answer(q, [], "concise", user)
            answer, source = (ans or {}).get("reply", ""), (ans or {}).get("source", "none")
        except Exception as e:
            answer, source = f"(chatbot error: {e})", "error"

        # validator: ground-truth SQL then verdict
        v1 = claude_cli.complete(f"QUESTION: {q}\n\nCHATBOT'S ANSWER:\n{answer[:4000]}",
                                 system=_VALIDATOR_SYS, model=config.AGENT_MODEL, timeout=180)
        stmts = _extract_sql(v1)
        verdict = None
        gt = []
        if stmts:
            gt = [{"query": s, **pg_query.run_select(s, max_rows=30)} for s in stmts]
            v2 = claude_cli.complete(
                f"QUESTION: {q}\n\nCHATBOT'S ANSWER:\n{answer[:4000]}\n\nSQL RESULTS (ground truth):\n"
                + json.dumps(gt, default=str)[:12000] + "\n\nNow give the verdict JSON only.",
                system=_VALIDATOR_SYS, model=config.AGENT_MODEL, timeout=180)
            verdict = _extract_json(v2)
        if not verdict:
            verdict = _extract_json(v1) or {"verdict": "SKIP", "score": None,
                                            "expected": "", "correction": "", "lesson": ""}
        rec = {"cycle": cycle_id, "t": dt.datetime.now().isoformat(timespec="seconds"),
               "question": q, "answer_source": source, "answer_head": answer[:500],
               "verdict": verdict.get("verdict"), "score": verdict.get("score"),
               "expected": verdict.get("expected", ""), "correction": verdict.get("correction", ""),
               "ground_truth": [{"query": g.get("query"), "rowcount": g.get("rowcount"),
                                 "error": g.get("error")} for g in gt]}
        results.append(rec)

        lesson = (verdict.get("lesson") or "").strip()
        if verdict.get("verdict") in ("FAIL", "PARTIAL") and lesson:
            with _lock:
                lessons = _load(_LESSONS, [])
                if not any(lesson[:60] in x["lesson"] for x in lessons[-20:]):
                    lessons.append({"t": rec["t"], "question": q, "lesson": lesson,
                                    "correction": rec["correction"]})
                    json.dump(lessons[-100:], open(_LESSONS, "w"), indent=1, ensure_ascii=False)

    with _lock:
        hist = _load(_HIST, [])
        hist += results
        json.dump(hist[-400:], open(_HIST, "w"), indent=1, ensure_ascii=False)

    try:
        if len(_load(_LESSONS, [])) % 8 < cfg["questions_per_cycle"]:
            consolidate_lessons()
    except Exception:
        pass
    passed = sum(1 for r in results if r["verdict"] == "PASS")
    summary = (f"Cycle {cycle_id}: {len(results)} answers validated — {passed} PASS, "
               f"{sum(1 for r in results if r['verdict']=='PARTIAL')} PARTIAL, "
               f"{sum(1 for r in results if r['verdict']=='FAIL')} FAIL")
    _mem_update("validator", summary)
    return {"cycle": cycle_id, "results": results, "summary": summary}


# ---------------------------------------------------------------- scheduler
_STOP = threading.Event()
_STARTED = False
_last_fire = None


def _loop():
    global _last_fire
    while not _STOP.wait(30):
        cfg = get_cfg()
        if not cfg["enabled"]:
            continue
        now = dt.datetime.now()
        if _last_fire and (now - _last_fire).total_seconds() < cfg["interval_minutes"] * 60:
            continue
        _last_fire = now
        try:
            run_qa_cycle(trigger="scheduled")
        except Exception:
            pass


def start_qa_scheduler():
    global _STARTED
    if not _STARTED:
        _STARTED = True
        threading.Thread(target=_loop, daemon=True).start()
