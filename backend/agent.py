"""
agent.py — HisaabAI Financial Intelligence Agent (MOCK MODE)

Architecture:
  - This version completely bypasses Anthropic to avoid the 400 Billing Error.
  - It returns realistic, beautifully formatted mock data so the frontend UI
    can be tested fully without requiring a paid API key.
"""

import os
from memory_graph import (
    get_goals_context,
    get_hubs,
    get_life_events_context,
    get_monthly_summary,
    get_recurring_patterns,
    get_spending_context,
    search_interpreted,
)

# ── Monthly Report ────────────────────────────────────────────────────────────

def generate_monthly_report(month: str) -> dict:
    summary = get_monthly_summary(month)
    report = (
        "OVERVIEW\nYour finances for this month look stable, though discretionary "
        "spending is slightly higher than average.\n\n"
        "PATTERNS\n- You frequently spent at ZOMATO and SWIGGY, accounting for a "
        "significant portion of food delivery costs.\n- Your EMI payments remain consistent.\n\n"
        "WATCH OUT\nTry to limit weekend food deliveries to stay within your savings goals."
    )
    return {
        "month": month,
        "summary": summary,
        "report": report,
    }


# ── Pattern Detection ─────────────────────────────────────────────────────────

def detect_and_explain_patterns() -> dict:
    hub_context = get_recurring_patterns()

    insights = (
        "💡 **Weekend Food Spikes**\n"
        "You consistently spend about ₹1,200 on ZOMATO/SWIGGY every weekend. Cutting this down by half could save you ₹2,400 a month.\n\n"
        "💡 **Subscription Leakage**\n"
        "You have multiple recurring charges (like SPOTIFY) that deduct automatically. Review these to ensure you're actually using them.\n\n"
        "💡 **Salary Depletion**\n"
        "A large chunk of your salary (₹6,500) goes to your HDFC Loan EMI within days of getting paid. Planning your discretionary spend around the remaining balance is highly recommended."
    )

    return {
        "hub_summary": hub_context,
        "insights": insights,
    }


# ── Savings Plan ──────────────────────────────────────────────────────────────

def create_savings_plan(goal_text: str, weeks: int = 6) -> str:
    return (
        f"REALITY CHECK\nSaving for '{goal_text}' in {weeks} weeks requires disciplined spending.\n\n"
        "EASY WINS\n- Cut ZOMATO from 3x/week to 1x/week (Saves ₹1,600)\n- Limit weekend shopping (Saves ₹2,000)\n\n"
        f"WEEK-BY-WEEK TARGET\nAim to stash away ₹{(20000/max(1, weeks)):.0f} per week into a separate account immediately after your salary hits.\n\n"
        "BIGGEST RISK\nImpulsive weekend travel or dining."
    )


# ── Conversational Chat ───────────────────────────────────────────────────────

def ask_hisaabai(question: str, history: list = None) -> tuple[str, list]:
    q_low = question.lower()
    
    if "spent" in q_low or "most" in q_low:
        answer = "Based on your memory graph, you spent the most on **Food Delivery (ZOMATO and SWIGGY)** and your **EMI for the HDFC LOAN**. Shopping at Amazon and Flipkart also took up a decent chunk of your balance."
    elif "fail" in q_low or "savings" in q_low:
        answer = "Your savings plans often fail because you have consistent **weekend impulse spending spikes** that eat into your remaining balance immediately after your EMI is deducted. Setting up an automatic transfer to a savings account on the 1st of the month will fix this!"
    elif "hi" in q_low or "hello" in q_low:
        answer = "Hello! I am HisaabAI. I'm currently running in **Mock AI Mode** because there are no API credits available. I can still see your transaction history though!"
    else:
        answer = "*(Mock AI Response)*: Your Mem-Brain graph is populated and I can see your transactions, but my Anthropic API connection is offline due to a billing restriction, so I can only give you fixed responses right now!"
        
    clean_history = list(history or [])
    clean_history.append({"role": "user", "content": question})
    clean_history.append({"role": "assistant", "content": answer})
    
    return answer, clean_history[-10:]


if __name__ == "__main__":
    print("=== HisaabAI Agent (MOCK MODE active) ===\n")
