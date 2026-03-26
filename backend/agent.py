"""
agent.py - HisaabAI Financial Intelligence Agent

Architecture:
  - Uses OpenRouter when available for AI-powered financial insights.
  - Falls back to deterministic local answers when the upstream model is rate-limited.
"""

from __future__ import annotations

import os
import re
import time

import httpx
from dotenv import load_dotenv

from memory_graph import (
    get_goals_context,
    get_monthly_summary,
    get_recurring_patterns,
    get_spending_context,
)

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

SYSTEM_PERSONA = (
    "You are HisaabAI, a smart and friendly personal finance assistant for Indian users. "
    "You analyze real transaction data from the user's memory graph and give concise, "
    "actionable financial advice. Use Rs for currency. Be warm but direct. "
    "Use bullet points and bold text for clarity. Keep responses under 150 words."
)

RATE_LIMIT_MESSAGE = (
    "The AI provider is rate-limiting requests right now, so I switched to a local answer "
    "based on your stored transactions."
)


def _format_inr(amount: float) -> str:
    return f"Rs {amount:,.0f}"


def _extract_transactions(context: str) -> list[dict]:
    transactions = []
    for raw_line in context.splitlines():
        line = raw_line.strip().lstrip("-").strip()
        if not line:
            continue

        type_match = re.match(r"^(Debit|Credit)", line, re.IGNORECASE)
        amount_match = re.search(r"(?:₹|Rs\.?|INR|â‚¹)\s*([\d,]+(?:\.\d+)?)", line, re.IGNORECASE)
        merchant_match = re.search(r"at\s+(.+?)\s+on", line, re.IGNORECASE)
        date_match = re.search(r"on\s+(\d{4}-\d{2}-\d{2})", line, re.IGNORECASE)
        category_match = re.search(r"Category:\s*([\w_]+)", line, re.IGNORECASE)

        if not amount_match:
            continue

        transactions.append(
            {
                "type": type_match.group(1).lower() if type_match else "debit",
                "amount": float(amount_match.group(1).replace(",", "")),
                "merchant": merchant_match.group(1) if merchant_match else "Unknown",
                "date": date_match.group(1) if date_match else "--",
                "category": (category_match.group(1).lower() if category_match else "other"),
            }
        )

    return transactions


def _top_categories(transactions: list[dict], limit: int = 3) -> list[tuple[str, float]]:
    totals: dict[str, float] = {}
    for tx in transactions:
        if tx["type"] != "debit":
            continue
        totals[tx["category"]] = totals.get(tx["category"], 0.0) + tx["amount"]
    return sorted(totals.items(), key=lambda item: item[1], reverse=True)[:limit]


def _top_merchants(transactions: list[dict], limit: int = 3) -> list[tuple[str, float]]:
    totals: dict[str, float] = {}
    for tx in transactions:
        if tx["type"] != "debit":
            continue
        totals[tx["merchant"]] = totals.get(tx["merchant"], 0.0) + tx["amount"]
    return sorted(totals.items(), key=lambda item: item[1], reverse=True)[:limit]


def _local_finance_answer(question: str, spending_context: str, patterns: str) -> str:
    transactions = _extract_transactions(spending_context)
    debits = [tx for tx in transactions if tx["type"] == "debit"]
    credits = [tx for tx in transactions if tx["type"] == "credit"]
    total_spent = sum(tx["amount"] for tx in debits)
    total_income = sum(tx["amount"] for tx in credits)
    net = total_income - total_spent
    top_categories = _top_categories(transactions)
    top_merchants = _top_merchants(transactions)
    q = question.lower()

    lines = [f"{RATE_LIMIT_MESSAGE}\n"]

    if "most" in q and ("spend" in q or "spent" in q):
        if top_categories:
            category, amount = top_categories[0]
            lines.append(f"**Biggest spending category:** {category.replace('_', ' ')} at {_format_inr(amount)}.")
        if top_merchants:
            merchant, amount = top_merchants[0]
            lines.append(f"**Highest-spend merchant:** {merchant} at {_format_inr(amount)}.")
    elif "income" in q or "earn" in q:
        lines.append(f"**Total income tracked:** {_format_inr(total_income)}.")
        lines.append(f"**Net position after spending:** {_format_inr(net)}.")
    elif "save" in q or "savings" in q or "cut" in q:
        if top_categories:
            formatted = ", ".join(
                f"{category.replace('_', ' ')} ({_format_inr(amount)})"
                for category, amount in top_categories
            )
            lines.append(f"**Best places to cut first:** {formatted}.")
        lines.append("**Fastest win:** reduce repeat debit categories before cutting essentials.")
    else:
        lines.append(
            f"**Tracked summary:** spent {_format_inr(total_spent)}, income {_format_inr(total_income)}, net {_format_inr(net)}."
        )
        if top_categories:
            formatted = ", ".join(
                f"{category.replace('_', ' ')} ({_format_inr(amount)})"
                for category, amount in top_categories
            )
            lines.append(f"**Top categories:** {formatted}.")

    if patterns and patterns != "No dominant patterns found yet.":
        pattern_lines = [line.strip("- ").strip() for line in patterns.splitlines() if line.strip()]
        if pattern_lines:
            lines.append(f"**Recent pattern signal:** {pattern_lines[0]}")

    if not transactions:
        return (
            f"{RATE_LIMIT_MESSAGE}\n\n"
            "I could not build a local answer because there are no stored transaction memories yet."
        )

    return "\n".join(lines)


def _call_ai(messages: list[dict], max_tokens: int = 2048) -> tuple[str | None, str | None]:
    """Call the AI model via OpenRouter API.

    Returns `(content, error_code)`. When the upstream is rate-limited, content is `None`
    and error_code is `"rate_limit"` so callers can degrade gracefully.
    """
    if not OPENROUTER_API_KEY:
        return None, "missing_api_key"

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

    for attempt in range(2):
        try:
            response = httpx.post(OPENROUTER_URL, json=payload, headers=headers, timeout=60.0)
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]

            content = message.get("content")
            if content:
                return content, None

            reasoning = message.get("reasoning")
            if reasoning:
                return f"(AI partial reasoning)\n{reasoning}", None

            return "I processed your request but did not generate a response. Please try again.", None
        except httpx.HTTPStatusError as error:
            status_code = error.response.status_code
            if status_code == 429:
                if attempt == 0:
                    time.sleep(1.5)
                    continue
                print(f"OpenRouter rate limited request: {error.response.text[:300]}")
                return None, "rate_limit"

            print(f"OpenRouter HTTP error {status_code}: {error.response.text[:300]}")
            return None, f"http_{status_code}"
        except Exception as error:
            print(f"OpenRouter API error [{type(error).__name__}]: {error}")
            return None, "network_error"

    return None, "unknown_error"


def generate_monthly_report(month: str) -> dict:
    summary = get_monthly_summary(month)
    spending_context = get_spending_context(month=month)

    prompt = (
        f"Here is the user's financial summary for {month}:\n"
        f"- Total Spent: Rs {summary.get('total_spent', 0)}\n"
        f"- Total Income: Rs {summary.get('total_income', 0)}\n"
        f"- Net: Rs {summary.get('net', 0)}\n"
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
    report, error_code = _call_ai(messages)
    if not report:
        report = (
            f"{RATE_LIMIT_MESSAGE if error_code == 'rate_limit' else 'The AI model is unavailable, so this is a local summary.'}\n\n"
            f"**Overview:** spent {_format_inr(summary.get('total_spent', 0))}, "
            f"earned {_format_inr(summary.get('total_income', 0))}, "
            f"net {_format_inr(summary.get('net', 0))}.\n"
            f"**Watch out:** top categories were {summary.get('by_category', {}) or 'not available'}."
        )

    return {
        "month": month,
        "summary": summary,
        "report": report,
    }


def detect_and_explain_patterns() -> dict:
    hub_context = get_recurring_patterns()

    prompt = (
        "Here are the user's recent transactions from their memory graph:\n"
        f"{hub_context}\n\n"
        "Analyze these transactions and identify:\n"
        "1. Recurring spending patterns\n"
        "2. Potential savings opportunities\n"
        "3. Any warning signs in their spending behavior\n"
        "Format each insight with a short bold title."
    )

    messages = [
        {"role": "system", "content": SYSTEM_PERSONA},
        {"role": "user", "content": prompt},
    ]
    insights, error_code = _call_ai(messages)
    if not insights:
        local_summary = _local_finance_answer("Summarize my spending patterns", hub_context, hub_context)
        prefix = RATE_LIMIT_MESSAGE if error_code == "rate_limit" else "The AI model is unavailable, so this is a local summary."
        insights = f"{prefix}\n\n{local_summary}"

    return {
        "hub_summary": hub_context,
        "insights": insights,
    }


def create_savings_plan(goal_text: str, weeks: int = 6) -> str:
    spending_context = get_spending_context()
    goals_context = get_goals_context()

    prompt = (
        f"The user wants to save for: '{goal_text}' in {weeks} weeks.\n\n"
        f"Their recent spending:\n{spending_context}\n\n"
        f"Their existing goals:\n{goals_context}\n\n"
        "Create a realistic, actionable savings plan with sections:\n"
        "REALITY CHECK, EASY WINS, WEEK-BY-WEEK TARGET, and BIGGEST RISK."
    )

    messages = [
        {"role": "system", "content": SYSTEM_PERSONA},
        {"role": "user", "content": prompt},
    ]
    plan, error_code = _call_ai(messages)
    if plan:
        return plan

    local_plan = _local_finance_answer(f"How can I save for {goal_text}?", spending_context, "")
    prefix = RATE_LIMIT_MESSAGE if error_code == "rate_limit" else "The AI model is unavailable, so this is a local plan."
    return f"{prefix}\n\n{local_plan}"


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

    for msg in clean_history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    answer, error_code = _call_ai(messages)
    if not answer:
        answer = _local_finance_answer(question, spending_context, patterns)
        if error_code and error_code not in {"rate_limit", "missing_api_key"}:
            answer = (
                "The upstream AI call failed, so I answered from local transaction memory instead.\n\n"
                f"{answer}"
            )

    clean_history.append({"role": "user", "content": question})
    clean_history.append({"role": "assistant", "content": answer})

    return answer, clean_history[-10:]


if __name__ == "__main__":
    print("=== HisaabAI Agent (OpenRouter with local fallback) ===")
