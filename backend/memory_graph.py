import os
import json
import re
from datetime import datetime

# Local storage to bypass broken Railway API
LOCAL_DB_FILE = os.path.join(os.path.dirname(__file__), "local_graph.json")

def _load_db() -> list[dict]:
    if os.path.exists(LOCAL_DB_FILE):
        try:
            with open(LOCAL_DB_FILE, "r") as f:
                return json.load(f)
        except:
            return []
    return []

def _save_db(db: list[dict]):
    with open(LOCAL_DB_FILE, "w") as f:
        json.dump(db, f, indent=2)

def store_memory(content: str, tags: list[str], category: str = None) -> dict:
    db = _load_db()
    mem_id = f"mem_{len(db) + 1}"
    mem = {
        "memory_id": mem_id,
        "content": content,
        "tags": tags,
        "category": category,
        "timestamp": datetime.now().isoformat()
    }
    db.append(mem)
    _save_db(db)
    return {"memory_id": mem_id, "action": "created", "memory": mem}

def store_transaction(tx: dict) -> dict:
    merchant = (tx.get("merchant") or "unknown").lower().replace(" ", "_")
    amount = tx.get("amount") or 0
    category = tx.get("category") or "other"
    tx_type = tx.get("type") or "debit"
    date = tx.get("date") or datetime.now().strftime("%Y-%m-%d")
    note = tx.get("context_note") or ""

    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        week_tag = f"week.{dt.strftime('%G-W%V')}"
    except ValueError:
        week_tag = "week.unknown"

    content = (
        f"{tx_type.capitalize()} of ₹{amount:.0f} "
        f"at {tx.get('merchant', 'unknown')} on {date}. "
        f"Category: {category}. {note}"
    ).strip()

    tags = [
        f"type.{tx_type}", f"category.{category}", f"merchant.{merchant}",
        f"month.{date[:7]}", week_tag, f"day.{date}"
    ]

    result = store_memory(content, tags, category="transaction")
    print(f"  ✓ [{result.get('action')}] {content[:70]}…")
    return result

def store_goal(goal_text: str, target_amount: float = None, deadline: str = None) -> dict:
    content = f"User financial goal: {goal_text}"
    if target_amount: content += f" Target savings: ₹{target_amount:.0f}."
    if deadline: content += f" Deadline: {deadline}."
    tags = ["type.goal"]
    if deadline: tags.append(f"deadline.{deadline}")
    return store_memory(content, tags, category="goal")

def store_life_event(event_text: str, event_date: str = None) -> dict:
    content = f"Life event: {event_text}"
    if event_date: content += f" Date: {event_date}."
    tags = ["type.life_event", f"day.{event_date or 'unknown'}"]
    return store_memory(content, tags, category="life_event")

def ingest_transactions(transactions: list[dict]) -> list[dict]:
    stored = []
    print(f"\n📥 Ingesting {len(transactions)} transactions locally…")
    for tx in transactions:
        try:
            result = store_transaction(tx)
            stored.append(result)
        except Exception as e:
            print(f"  ✗ Failed {tx.get('sms_id')}: {e}")
    print(f"✅ Stored {len(stored)}/{len(transactions)} memories\n")
    return stored

def search(query: str, k: int = 10, keyword_filter=None, response_format: str = "interpreted") -> dict:
    db = _load_db()
    results = []
    
    # Filter by keyword_filter if present
    for mem in db:
        if keyword_filter:
            # Handle list of filters (AND logic)
            filters = keyword_filter if isinstance(keyword_filter, list) else [keyword_filter]
            match = True
            for f in filters:
                # regex simple check against tags
                clean_f = f.replace("\\.", ".") # clean regex escaping
                if not any(re.search(clean_f, tag) for tag in mem.get("tags", [])):
                    match = False
                    break
            if not match: continue
        results.append(mem)

    # Sort newest first, take top k (dummy semantic search behavior)
    results = sorted(results, key=lambda x: x.get("timestamp", ""), reverse=True)[:k]
    
    return {"results": results}

def search_interpreted(query: str, k: int = 10, keyword_filter=None) -> str:
    """Local interpreted: just return the raw memories as a string so Claude can read them."""
    data = search(query, k=k, keyword_filter=keyword_filter)
    results = data.get("results", [])
    lines = [r.get("content", "") for r in results if r.get("content")]
    return "\n".join(f"- {l}" for l in lines) if lines else "No relevant memories found."

def get_spending_context(category: str = None, month: str = None) -> str:
    filters = []
    if category: filters.append(f"category\\.{category}")
    if month: filters.append(f"month\\.{month}")
    return search_interpreted(f"spending {category or ''} {month or ''}", k=20, keyword_filter=filters if filters else None)

def get_goals_context() -> str:
    return search_interpreted("goals", k=10, keyword_filter="type\\.goal")

def get_life_events_context() -> str:
    return search_interpreted("life events", k=10, keyword_filter="type\\.life_event")

def get_recurring_patterns() -> str:
    db = _load_db()
    memories = [m for m in db if "transaction" in m.get("category", "")]
    if not memories: return "No dominant patterns found yet."
    return "\n".join([f"- {m.get('content')}" for m in memories[:15]])

def get_monthly_summary(month: str) -> dict:
    data = search(query=f"all transactions in {month}", k=100, keyword_filter=f"month\\.{month}")
    results = data.get("results", [])

    total_debit, total_credit = 0.0, 0.0
    by_category = {}

    for r in results:
        content = r.get("content", "")
        tags = r.get("tags", [])

        amt_match = re.search(r"₹([\d,]+)", content)
        if not amt_match: continue
        amount = float(amt_match.group(1).replace(",", ""))

        is_credit = any(t in ("type.credit", "type.income") for t in tags)
        category = next((t.replace("category.", "") for t in tags if t.startswith("category.")), "other")

        if is_credit: total_credit += amount
        else:
            total_debit += amount
            by_category[category] = by_category.get(category, 0) + amount

    return {
        "month": month,
        "total_spent": round(total_debit, 2),
        "total_income": round(total_credit, 2),
        "net": round(total_credit - total_debit, 2),
        "by_category": by_category,
        "transaction_count": len(results),
    }

def get_hubs(limit: int = 10) -> dict: return {"hubs": []}
def get_neighborhood(memory_id: str, hops: int = 2) -> dict: return {}
def find_path(from_id: str, to_id: str) -> dict: return {}
def get_stats() -> dict: return {"total_memories": len(_load_db())}
def health_check() -> bool: return True

if __name__ == "__main__":
    print(f"Mem-Brain Local Override active. DB Size: {len(_load_db())}")
