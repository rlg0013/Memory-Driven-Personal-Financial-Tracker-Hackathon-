
"""
agent.py — HisaabAI Financial Intelligence Agent

Architecture:
  - Uses Nemotron 3 Super via OpenRouter for AI-powered financial insights.
  - Memory graph provides real transaction data as context for every AI call.
"""

import os
import httpx
from dotenv import load_dotenv

from memory_graph import (
    get_monthly_summary,
    get_recurring_patterns,
    get_spending_context,
    get_goals_context,
)

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

SYSTEM_PERSONA = (
    "You are HisaabAI, a smart and friendly personal finance assistant for Indian users. "
    "You analyze real transaction data from the user's memory graph and give concise, "
    "actionable financial advice. Use ₹ for currency. Be warm but direct. "
    "Use bullet points and bold text for clarity. Keep responses under 150 words."
)

def _call_ai(messages: list[dict], max_tokens: int = 2048) -> str:
    """Call the AI model via OpenRouter API."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hisaabai.app",
        "X-Title": "HisaabAI",
    }
    payload = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    import json
    with open(r"C:\tmp\payload.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    try:
        resp = httpx.post(OPENROUTER_URL, json=payload, headers=headers, timeout=60.0)
        resp.raise_for_status()
        data = resp.json()
        message = data["choices"][0]["message"]

        content = message.get("content")
        if content:
            return content

        reasoning = message.get("reasoning")
        if reasoning:
            return f"*(AI was still thinking — here's what it had so far):*\n{reasoning}"

        return "I processed your request but didn't generate a response. Please try again."
    except httpx.HTTPStatusError as e:
        err_body = getattr(e.response, "text", str(e))
        print(f"⚠️ OpenRouter HTTP Error: {err_body}")
        return f"I'm having trouble connecting to my AI brain right now. API Error: {err_body[:200]}"
    except Exception as e:
        err_msg = str(e)
        if hasattr(e, "response") and hasattr(e.response, "text"):
            err_msg += " \nBody: " + e.response.text
        print(f"⚠️ OpenRouter API error [{type(e).__name__}]: {err_msg}")
        return f"I'm having trouble connecting. [{type(e).__name__}]: {err_msg[:200]}"


# ── Monthly Report ────────────────────────────────────────────────────────────

def generate_monthly_report(month: str) -> dict:
    summary = get_monthly_summary(month)
    spending_context = get_spending_context(month=month)

    prompt = (
        f"Here is the user's financial summary for {month}:\n"
        f"- Total Spent: ₹{summary.get('total_spent', 0)}\n"
        f"- Total Income: ₹{summary.get('total_income', 0)}\n"
        f"- Net: ₹{summary.get('net', 0)}\n"
        f"- Categories: {summary.get('by_category', {})}\n"
        f"- Transaction Count: {summary.get('transaction_count', 0)}\n\n"
        f"Detailed transactions:\n{spending_context}\n\n"
        "Generate a concise monthly financial report with sections: "
        "OVERVIEW, PATTERNS, and WATCH OUT."
    )

    messages = [
        {"role": "system", "content": SYSTEM_PERSONA},
        {"role": "user", "content": prompt},
    ]
    report = _call_ai(messages)

    return {
        "month": month,
        "summary": summary,
        "report": report,
    }


# ── Pattern Detection ─────────────────────────────────────────────────────────

def detect_and_explain_patterns() -> dict:
    hub_context = get_recurring_patterns()

    prompt = (
        "Here are the user's recent transactions from their memory graph:\n"
        f"{hub_context}\n\n"
        "Analyze these transactions and identify:\n"
        "1. Recurring spending patterns (e.g., frequent food delivery)\n"
        "2. Potential savings opportunities\n"
        "3. Any warning signs in their spending behavior\n"
        "Format each insight with a 💡 emoji and bold title."
    )

    messages = [
        {"role": "system", "content": SYSTEM_PERSONA},
        {"role": "user", "content": prompt},
    ]
    insights = _call_ai(messages)

    return {
        "hub_summary": hub_context,
        "insights": insights,
    }


# ── Savings Plan ──────────────────────────────────────────────────────────────

def create_savings_plan(goal_text: str, weeks: int = 6) -> str:
    spending_context = get_spending_context()
    goals_context = get_goals_context()

    prompt = (
        f"The user wants to save for: '{goal_text}' in {weeks} weeks.\n\n"
        f"Their recent spending:\n{spending_context}\n\n"
        f"Their existing goals:\n{goals_context}\n\n"
        "Create a realistic, actionable savings plan with sections:\n"
        "REALITY CHECK, EASY WINS (specific cuts they can make based on their actual spending), "
        f"WEEK-BY-WEEK TARGET, and BIGGEST RISK."
    )

    messages = [
        {"role": "system", "content": SYSTEM_PERSONA},
        {"role": "user", "content": prompt},
    ]
    return _call_ai(messages)


# ── Conversational Chat ───────────────────────────────────────────────────────

def ask_hisaabai(question: str, history: list = None) -> tuple[str, list]:
    spending_context = get_spending_context()
    patterns = get_recurring_patterns()

    system_msg = (
        f"{SYSTEM_PERSONA}\n\n"
        f"The user's recent transaction data:\n{spending_context}\n\n"
        f"Spending patterns:\n{patterns}"
    )

    clean_history = list(history or [])
    messages = [{"role": "system", "content": system_msg}]

    # Add conversation history
    for msg in clean_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current question
    messages.append({"role": "user", "content": question})

    answer = _call_ai(messages)

    clean_history.append({"role": "user", "content": question})
    clean_history.append({"role": "assistant", "content": answer})

    return answer, clean_history[-10:]


if __name__ == "__main__":
    print("=== HisaabAI Agent (Nemotron 3 Super via OpenRouter) ===\n")
