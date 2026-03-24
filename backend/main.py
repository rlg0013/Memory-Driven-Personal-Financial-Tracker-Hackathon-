"""
main.py — HisaabAI FastAPI Backend
Run: uvicorn main:app --reload --port 8080
Docs: http://localhost:8080/docs
"""

from typing import Optional

from agent import (
    ask_hisaabai,
    create_savings_plan,
    detect_and_explain_patterns,
    generate_monthly_report,
)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from memory_graph import (
    get_monthly_summary,
    get_stats,
    health_check,
    ingest_transactions,
    search_interpreted,
    store_goal,
    store_life_event,
    store_transaction,
)
from pydantic import BaseModel
from sms_parser import parse_sms, parse_sms_batch

app = FastAPI(
    title="HisaabAI",
    description="Memory-driven personal finance consultant — powered by Alpha Nimble Mem-Brain",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory session store (swap with Redis for production)
_sessions: dict[str, list] = {}


# ── Request models ────────────────────────────────────────────────────────────


class SMSItem(BaseModel):
    id: str
    text: str
    date: Optional[str] = None


class SMSBatch(BaseModel):
    messages: list[SMSItem]


class SingleSMS(BaseModel):
    text: str
    date: Optional[str] = None


class GoalRequest(BaseModel):
    goal_text: str
    target_amount: Optional[float] = None
    deadline: Optional[str] = None


class EventRequest(BaseModel):
    event_text: str
    event_date: Optional[str] = None


class PlanRequest(BaseModel):
    goal_text: str
    weeks: Optional[int] = 6


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = "default"


class SearchRequest(BaseModel):
    query: str
    k: Optional[int] = 10
    keyword_filter: Optional[str] = None


# ── Health & stats ────────────────────────────────────────────────────────────


@app.get("/")
def root():
    alive = health_check()
    return {
        "app": "HisaabAI",
        "mem_brain": "connected" if alive else "unreachable",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"mem_brain_alive": health_check()}


@app.get("/stats")
def stats():
    try:
        return get_stats()
    except Exception as e:
        raise HTTPException(500, str(e))


# ── SMS ingestion ─────────────────────────────────────────────────────────────


@app.post("/sms/ingest")
def ingest_batch(batch: SMSBatch):
    """Parse and store a batch of SMS messages into Mem-Brain."""
    sms_list = [{"id": s.id, "text": s.text, "date": s.date} for s in batch.messages]
    parsed = parse_sms_batch(sms_list)
    stored = ingest_transactions(parsed)
    return {
        "parsed": len(parsed),
        "stored": len(stored),
        "transactions": parsed,
    }


@app.post("/sms/single")
def ingest_single(sms: SingleSMS):
    """Parse and store a single SMS."""
    parsed = parse_sms(sms.text, sms.date)
    result = store_transaction(parsed)
    return {"parsed": parsed, "memory": result}


# ── Goals & life events ───────────────────────────────────────────────────────


@app.post("/goal")
def add_goal(req: GoalRequest):
    result = store_goal(req.goal_text, req.target_amount, req.deadline)
    return {"message": "Goal stored in Mem-Brain", "memory": result}


@app.post("/event")
def add_event(req: EventRequest):
    result = store_life_event(req.event_text, req.event_date)
    return {"message": "Life event stored", "memory": result}


# ── Reports & analysis ────────────────────────────────────────────────────────


@app.get("/summary/{month}")
def monthly_summary(month: str):
    """
    Raw stats for a month. month format: YYYY-MM (e.g. 2026-01)
    """
    try:
        return get_monthly_summary(month)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/report/{month}")
def monthly_report(month: str):
    """
    AI-generated contextual monthly report backed by Mem-Brain graph.
    """
    try:
        return generate_monthly_report(month)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/patterns")
def spending_patterns():
    """
    Detect non-obvious spending patterns using Mem-Brain hub nodes + interpreted search.
    """
    try:
        return detect_and_explain_patterns()
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Savings plan ──────────────────────────────────────────────────────────────


@app.post("/plan")
def savings_plan(req: PlanRequest):
    """
    Generate a personalized savings plan from actual spending memory.
    """
    try:
        plan = create_savings_plan(req.goal_text, req.weeks)
        return {"goal": req.goal_text, "weeks": req.weeks, "plan": plan}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Chat ──────────────────────────────────────────────────────────────────────


@app.post("/chat")
def chat(req: ChatRequest):
    """
    Conversational finance assistant.
    Mem-Brain provides the memory context; Claude generates the response.
    """
    try:
        history = _sessions.get(req.session_id, [])
        answer, updated = ask_hisaabai(req.question, history)
        _sessions[req.session_id] = updated
        return {
            "question": req.question,
            "answer": answer,
            "session_id": req.session_id,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Raw Mem-Brain search (useful for demo/debugging) ─────────────────────────


@app.post("/search")
def raw_search(req: SearchRequest):
    """
    Direct semantic search over Mem-Brain. Useful for demo and debugging.
    """
    try:
        result = search_interpreted(
            req.query, k=req.k, keyword_filter=req.keyword_filter
        )
        return {"query": req.query, "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
