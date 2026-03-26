import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime

LOCAL_DB_FILE = os.path.join(os.path.dirname(__file__), "local_graph.json")

DISCRETIONARY_CATEGORIES = {
    "food_delivery",
    "shopping",
    "entertainment",
    "travel",
    "fitness",
}

ESSENTIAL_CATEGORIES = {
    "groceries",
    "utilities",
    "healthcare",
}


def _load_db() -> list[dict]:
    if os.path.exists(LOCAL_DB_FILE):
        try:
            with open(LOCAL_DB_FILE, "r", encoding="utf-8") as file:
                return json.load(file)
        except Exception:
            return []
    return []


def _save_db(db: list[dict]):
    with open(LOCAL_DB_FILE, "w", encoding="utf-8") as file:
        json.dump(db, file, indent=2)


def _extract_tag_value(tags: list[str], prefix: str, default: str | None = None) -> str | None:
    match = next((tag[len(prefix):] for tag in tags if tag.startswith(prefix)), None)
    return match if match is not None else default


def _parse_amount(text: str) -> float:
    match = re.search(r"(?:₹|â‚¹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)", text, re.IGNORECASE)
    if not match:
        return 0.0
    return float(match.group(1).replace(",", ""))


def _parse_goal_text(content: str) -> dict:
    goal_match = re.search(r"User financial goal:\s*(.+?)(?:\s+Target savings:|\s+Deadline:|$)", content)
    target_match = re.search(r"Target savings:\s*(?:₹|â‚¹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)", content, re.IGNORECASE)
    deadline_match = re.search(r"Deadline:\s*([\d-]+)", content)
    return {
        "goal_text": goal_match.group(1).strip() if goal_match else "Unnamed goal",
        "target_amount": float(target_match.group(1).replace(",", "")) if target_match else None,
        "deadline": deadline_match.group(1) if deadline_match else None,
    }


def _safe_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None


def _format_currency(amount: float) -> str:
    return f"Rs {amount:,.0f}"


def _memory_to_transaction(memory: dict) -> dict | None:
    if memory.get("category") != "transaction":
        return None

    tags = memory.get("tags", [])
    transaction = {
        "memory_id": memory.get("memory_id"),
        "content": memory.get("content", ""),
        "amount": _parse_amount(memory.get("content", "")),
        "type": _extract_tag_value(tags, "type.", "debit"),
        "category": _extract_tag_value(tags, "category.", "other"),
        "merchant": _extract_tag_value(tags, "merchant.", "unknown"),
        "date": _extract_tag_value(tags, "day.", "unknown"),
        "month": _extract_tag_value(tags, "month.", "unknown"),
        "week": _extract_tag_value(tags, "week.", "unknown"),
        "timestamp": memory.get("timestamp"),
    }
    transaction["behavior_class"] = _classify_transaction(transaction)
    return transaction


def _classify_transaction(transaction: dict) -> str:
    category = transaction["category"]
    merchant = transaction["merchant"]
    amount = transaction["amount"]
    date = _safe_date(transaction["date"])

    if transaction["type"] == "credit":
        return "income"
    if category in DISCRETIONARY_CATEGORIES:
        return "discretionary"
    if category in ESSENTIAL_CATEGORIES:
        return "essential"
    if merchant == "unknown" and amount >= 5000:
        return "fixed_commitment"
    if date and 14 <= date.day <= 18 and amount >= 4000:
        return "fixed_commitment"
    return "obligation"


def _get_transactions() -> list[dict]:
    transactions = []
    for memory in _load_db():
        transaction = _memory_to_transaction(memory)
        if transaction:
            transactions.append(transaction)
    return sorted(transactions, key=lambda item: (item.get("date", ""), item.get("timestamp", "")))


def _get_goals() -> list[dict]:
    goals = []
    for memory in _load_db():
        if memory.get("category") != "goal":
            continue
        goals.append(
            {
                "memory_id": memory.get("memory_id"),
                "content": memory.get("content", ""),
                "timestamp": memory.get("timestamp"),
                **_parse_goal_text(memory.get("content", "")),
            }
        )
    return sorted(goals, key=lambda item: item.get("timestamp", ""))


def _get_life_events() -> list[dict]:
    events = []
    for memory in _load_db():
        if memory.get("category") != "life_event":
            continue
        tags = memory.get("tags", [])
        events.append(
            {
                "memory_id": memory.get("memory_id"),
                "content": memory.get("content", ""),
                "date": _extract_tag_value(tags, "day.", "unknown"),
                "timestamp": memory.get("timestamp"),
            }
        )
    return sorted(events, key=lambda item: item.get("timestamp", ""))


def _months_span(transactions: list[dict]) -> int:
    months = {tx["month"] for tx in transactions if tx["month"] != "unknown"}
    return max(len(months), 1)


def _top_totals(transactions: list[dict], key: str, limit: int = 5, include_classes: set[str] | None = None):
    totals = defaultdict(float)
    counts = defaultdict(int)
    for tx in transactions:
        if tx["type"] == "credit":
            continue
        if include_classes and tx["behavior_class"] not in include_classes:
            continue
        totals[tx[key]] += tx["amount"]
        counts[tx[key]] += 1
    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:limit]
    return [(name, amount, counts[name]) for name, amount in ranked]


def _connection_strength(transactions: list[dict]) -> list[dict]:
    pair_counter = Counter()
    for tx in transactions:
        if tx["type"] == "credit":
            continue
        pair_counter[(f"merchant:{tx['merchant']}", f"category:{tx['category']}")] += 1
        pair_counter[(f"month:{tx['month']}", f"category:{tx['category']}")] += 1
        pair_counter[(f"week:{tx['week']}", f"merchant:{tx['merchant']}")] += 1

    ranked = pair_counter.most_common(12)
    return [
        {"source": source, "target": target, "weight": weight}
        for (source, target), weight in ranked
    ]


def store_memory(content: str, tags: list[str], category: str = None) -> dict:
    db = _load_db()
    mem_id = f"mem_{len(db) + 1}"
    mem = {
        "memory_id": mem_id,
        "content": content,
        "tags": tags,
        "category": category,
        "timestamp": datetime.now().isoformat(),
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
        f"type.{tx_type}",
        f"category.{category}",
        f"merchant.{merchant}",
        f"month.{date[:7]}",
        week_tag,
        f"day.{date}",
    ]

    result = store_memory(content, tags, category="transaction")
    print(f"  ✓ [{result.get('action')}] {content[:70]}…")
    return result


def store_goal(goal_text: str, target_amount: float = None, deadline: str = None) -> dict:
    content = f"User financial goal: {goal_text}"
    if target_amount:
        content += f" Target savings: ₹{target_amount:.0f}."
    if deadline:
        content += f" Deadline: {deadline}."
    tags = ["type.goal"]
    if deadline:
        tags.append(f"deadline.{deadline}")
    return store_memory(content, tags, category="goal")


def store_life_event(event_text: str, event_date: str = None) -> dict:
    content = f"Life event: {event_text}"
    if event_date:
        content += f" Date: {event_date}."
    tags = ["type.life_event", f"day.{event_date or 'unknown'}"]
    return store_memory(content, tags, category="life_event")


def ingest_transactions(transactions: list[dict]) -> list[dict]:
    stored = []
    print(f"\n📥 Ingesting {len(transactions)} transactions locally…")
    for tx in transactions:
        try:
            result = store_transaction(tx)
            stored.append(result)
        except Exception as error:
            print(f"  ✗ Failed {tx.get('sms_id')}: {error}")
    print(f"✅ Stored {len(stored)}/{len(transactions)} memories\n")
    return stored


def search(query: str, k: int = 10, keyword_filter=None, response_format: str = "interpreted") -> dict:
    db = _load_db()
    results = []

    for mem in db:
        if keyword_filter:
            filters = keyword_filter if isinstance(keyword_filter, list) else [keyword_filter]
            match = True
            for item in filters:
                clean_item = item.replace("\\.", ".")
                if not any(re.search(clean_item, tag) for tag in mem.get("tags", [])):
                    match = False
                    break
            if not match:
                continue
        results.append(mem)

    results = sorted(results, key=lambda item: item.get("timestamp", ""), reverse=True)[:k]
    return {"results": results}


def search_interpreted(query: str, k: int = 10, keyword_filter=None) -> str:
    data = search(query, k=k, keyword_filter=keyword_filter)
    results = data.get("results", [])
    lines = [item.get("content", "") for item in results if item.get("content")]
    return "\n".join(f"- {line}" for line in lines) if lines else "No relevant memories found."


def get_spending_context(category: str = None, month: str = None) -> str:
    filters = []
    if category:
        filters.append(f"category\\.{category}")
    if month:
        filters.append(f"month\\.{month}")
    return search_interpreted(f"spending {category or ''} {month or ''}", k=20, keyword_filter=filters if filters else None)


def get_goals_context() -> str:
    return search_interpreted("goals", k=10, keyword_filter="type\\.goal")


def get_life_events_context() -> str:
    return search_interpreted("life events", k=10, keyword_filter="type\\.life_event")


def get_recurring_patterns() -> str:
    transactions = _get_transactions()
    if not transactions:
        return "No dominant patterns found yet."
    recent = transactions[-15:]
    return "\n".join([f"- {item.get('content')}" for item in recent])


def get_monthly_summary(month: str) -> dict:
    transactions = [item for item in _get_transactions() if item.get("month") == month]

    total_debit = sum(item["amount"] for item in transactions if item["type"] != "credit")
    total_credit = sum(item["amount"] for item in transactions if item["type"] == "credit")
    by_category: dict[str, float] = {}

    for item in transactions:
        if item["type"] == "credit":
            continue
        by_category[item["category"]] = by_category.get(item["category"], 0.0) + item["amount"]

    return {
        "month": month,
        "total_spent": round(total_debit, 2),
        "total_income": round(total_credit, 2),
        "net": round(total_credit - total_debit, 2),
        "by_category": by_category,
        "transaction_count": len(transactions),
    }


def get_memory_graph_data() -> dict:
    transactions = _get_transactions()
    goals = _get_goals()
    life_events = _get_life_events()

    nodes = []
    edges = []
    seen_nodes = set()

    def add_node(node_id: str, label: str, node_type: str, meta: dict | None = None):
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        nodes.append({"id": node_id, "label": label, "type": node_type, "meta": meta or {}})

    for tx in transactions:
        tx_id = tx["memory_id"]
        add_node(
            tx_id,
            f"{_format_currency(tx['amount'])} · {tx['merchant'].replace('_', ' ')}",
            "transaction",
            {
                "date": tx["date"],
                "category": tx["category"],
                "merchant": tx["merchant"],
                "amount": tx["amount"],
                "month": tx["month"],
                "behavior_class": tx["behavior_class"],
            },
        )

        category_id = f"category:{tx['category']}"
        merchant_id = f"merchant:{tx['merchant']}"
        month_id = f"month:{tx['month']}"
        week_id = f"week:{tx['week']}"

        add_node(category_id, tx["category"].replace("_", " "), "category")
        add_node(merchant_id, tx["merchant"].replace("_", " "), "merchant")
        add_node(month_id, tx["month"], "month")
        add_node(week_id, tx["week"], "week")

        edges.extend(
            [
                {"source": tx_id, "target": category_id, "type": "same_category"},
                {"source": tx_id, "target": merchant_id, "type": "same_merchant"},
                {"source": tx_id, "target": month_id, "type": "in_month"},
                {"source": tx_id, "target": week_id, "type": "in_week"},
            ]
        )

    for goal in goals:
        goal_id = goal["memory_id"]
        add_node(
            goal_id,
            goal["goal_text"],
            "goal",
            {"target_amount": goal["target_amount"], "deadline": goal["deadline"]},
        )

        for category, _amount, _count in _top_totals(
            transactions, "category", limit=3, include_classes={"discretionary", "obligation", "fixed_commitment"}
        ):
            category_id = f"category:{category}"
            if category_id in seen_nodes:
                edges.append({"source": goal_id, "target": category_id, "type": "affects_goal"})

    for event in life_events:
        event_id = event["memory_id"]
        add_node(event_id, event["content"].replace("Life event: ", ""), "life_event", {"date": event["date"]})
        event_date = _safe_date(event["date"])
        if not event_date:
            continue
        for tx in transactions:
            tx_date = _safe_date(tx["date"])
            if tx_date and abs((tx_date - event_date).days) <= 4:
                edges.append({"source": event_id, "target": tx["memory_id"], "type": "occurred_near"})

    relation_groups = {
        "transactions": [node for node in nodes if node["type"] == "transaction"][:12],
        "categories": [node for node in nodes if node["type"] == "category"][:8],
        "merchants": [node for node in nodes if node["type"] == "merchant"][:8],
        "time": [node for node in nodes if node["type"] in {"month", "week"}][:10],
        "goals": [node for node in nodes if node["type"] == "goal"][:4],
        "life_events": [node for node in nodes if node["type"] == "life_event"][:4],
    }

    edge_counts = Counter(edge["type"] for edge in edges)
    category_counts = Counter(tx["category"] for tx in transactions if tx["type"] != "credit")
    merchant_counts = Counter(tx["merchant"] for tx in transactions if tx["type"] != "credit")

    summary = {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "transaction_nodes": len(transactions),
        "categories": len({tx["category"] for tx in transactions}),
        "merchants": len({tx["merchant"] for tx in transactions}),
        "top_cluster": category_counts.most_common(1)[0][0].replace("_", " ") if category_counts else "none",
        "top_recurring_merchant": merchant_counts.most_common(1)[0][0].replace("_", " ") if merchant_counts else "none",
        "strongest_relation": edge_counts.most_common(1)[0][0].replace("_", " ") if edge_counts else "none",
    }

    return {
        "nodes": nodes,
        "edges": edges,
        "summary": summary,
        "relation_groups": relation_groups,
        "connection_strength": _connection_strength(transactions),
    }


def get_overspending_analysis() -> dict:
    transactions = [tx for tx in _get_transactions() if tx["type"] != "credit"]
    months = _months_span(transactions)
    total_spend = sum(tx["amount"] for tx in transactions)

    monthly_totals: dict[str, float] = defaultdict(float)
    timing_buckets = {"month_end": 0.0, "salary_window": 0.0, "rest": 0.0}
    class_totals = defaultdict(float)

    for tx in transactions:
        monthly_totals[tx["month"]] += tx["amount"]
        class_totals[tx["behavior_class"]] += tx["amount"]
        tx_date = _safe_date(tx["date"])
        if not tx_date:
            timing_buckets["rest"] += tx["amount"]
            continue
        if tx_date.day >= 25:
            timing_buckets["month_end"] += tx["amount"]
        elif 15 <= tx_date.day <= 18:
            timing_buckets["salary_window"] += tx["amount"]
        else:
            timing_buckets["rest"] += tx["amount"]

    top_discretionary = _top_totals(transactions, "category", limit=4, include_classes={"discretionary"})
    top_merchants = _top_totals(transactions, "merchant", limit=5, include_classes={"discretionary", "obligation", "fixed_commitment"})
    fixed_obligations = _top_totals(transactions, "merchant", limit=3, include_classes={"fixed_commitment"})

    fixed_share = (class_totals["fixed_commitment"] / total_spend * 100) if total_spend else 0.0
    discretionary_share = (class_totals["discretionary"] / total_spend * 100) if total_spend else 0.0
    month_end_share = (timing_buckets["month_end"] / total_spend * 100) if total_spend else 0.0
    salary_window_share = (timing_buckets["salary_window"] / total_spend * 100) if total_spend else 0.0

    drivers = [
        {
            "title": "Fixed commitment load",
            "detail": f"{fixed_share:.1f}% of debit spend looks like fixed obligations, which reduces flexibility before discretionary spending even starts.",
            "severity": "high" if fixed_share >= 35 else "medium",
        },
        {
            "title": "Discretionary leak",
            "detail": f"{discretionary_share:.1f}% of debit spend is discretionary, led by {top_discretionary[0][0].replace('_', ' ') if top_discretionary else 'small purchases'}.",
            "severity": "high" if discretionary_share >= 25 else "medium",
        },
        {
            "title": "Salary-week leakage",
            "detail": f"{salary_window_share:.1f}% of spend happens between the 15th and 18th, which suggests your cash-outflow spikes right after income lands.",
            "severity": "high" if salary_window_share >= 30 else "low",
        },
        {
            "title": "Month-end spike",
            "detail": f"{month_end_share:.1f}% of spend happens on or after day 25, which signals end-of-month drift.",
            "severity": "medium" if month_end_share >= 15 else "low",
        },
    ]

    recommendations = []
    for category, amount, _count in top_discretionary[:3]:
        recommendations.append(
            {
                "title": f"Reduce {category.replace('_', ' ')}",
                "detail": f"A 15% cut frees about {_format_currency(amount * 0.15)}.",
            }
        )
    if fixed_obligations:
        merchant, amount, count = fixed_obligations[0]
        recommendations.append(
            {
                "title": "Review fixed commitments",
                "detail": f"{merchant.replace('_', ' ')} appears {count} times as a likely fixed obligation and totals {_format_currency(amount)}.",
            }
        )

    summary = (
        f"Your spending pressure comes from a mix of fixed commitments ({fixed_share:.1f}% of debit spend) "
        f"and discretionary leakage ({discretionary_share:.1f}%), with the largest controllable category being "
        f"{top_discretionary[0][0].replace('_', ' ') if top_discretionary else 'small expenses'}."
    )

    return {
        "summary": summary,
        "drivers": drivers,
        "top_categories": [
            {"category": name, "amount": amount, "count": count}
            for name, amount, count in top_discretionary
        ],
        "top_merchants": [
            {"merchant": name, "amount": amount, "count": count}
            for name, amount, count in top_merchants
        ],
        "fixed_obligations": [
            {"merchant": name, "amount": amount, "count": count}
            for name, amount, count in fixed_obligations
        ],
        "monthly_totals": [{"month": month, "amount": amount} for month, amount in sorted(monthly_totals.items())],
        "timing_breakdown": [
            {"label": "Month-end", "share": round(month_end_share, 1)},
            {"label": "Salary window", "share": round(salary_window_share, 1)},
            {"label": "Rest of month", "share": round(100 - month_end_share - salary_window_share, 1)},
        ],
        "behavior_split": [
            {"label": "Fixed commitments", "share": round(fixed_share, 1)},
            {"label": "Discretionary", "share": round(discretionary_share, 1)},
            {"label": "Essentials & obligations", "share": round(max(0.0, 100 - fixed_share - discretionary_share), 1)},
        ],
        "recommendations": recommendations,
    }


def get_goal_reasoning(goal_text: str | None = None, target_amount: float | None = None, deadline: str | None = None) -> dict:
    goals = _get_goals()

    if goal_text:
        selected_goal = {
            "goal_text": goal_text,
            "target_amount": target_amount,
            "deadline": deadline,
            "memory_id": None,
        }
    elif goals:
        selected_goal = goals[-1]
    else:
        selected_goal = {
            "goal_text": "Build a savings cushion",
            "target_amount": 10000.0,
            "deadline": None,
            "memory_id": None,
        }

    all_transactions = _get_transactions()
    debit_transactions = [tx for tx in all_transactions if tx["type"] != "credit"]
    credit_transactions = [tx for tx in all_transactions if tx["type"] == "credit"]
    months = _months_span(debit_transactions)

    total_spend = sum(tx["amount"] for tx in debit_transactions)
    total_income = sum(tx["amount"] for tx in credit_transactions)
    monthly_average_spend = total_spend / months
    monthly_average_income = total_income / max(_months_span(credit_transactions), 1)
    discretionary_monthly = sum(tx["amount"] for tx in debit_transactions if tx["behavior_class"] == "discretionary") / months
    fixed_monthly = sum(tx["amount"] for tx in debit_transactions if tx["behavior_class"] == "fixed_commitment") / months

    target = float(selected_goal.get("target_amount") or max(monthly_average_spend * 0.5, 5000))
    deadline_dt = _safe_date(selected_goal.get("deadline"))
    now = datetime.now()
    weeks_left = max(((deadline_dt - now).days // 7) + 1, 1) if deadline_dt else 6
    weekly_target = target / weeks_left

    cut_candidates = _top_totals(debit_transactions, "category", limit=4, include_classes={"discretionary"})
    conflict_categories = []
    for category, amount, count in cut_candidates:
        monthly_amount = amount / months
        suggested_cut = monthly_amount * 0.2
        conflict_categories.append(
            {
                "category": category,
                "amount": round(monthly_amount, 2),
                "count": count,
                "reason": f"{category.replace('_', ' ')} keeps repeating and is one of the most cuttable categories in your memory history.",
                "suggested_cut": round(suggested_cut, 2),
            }
        )

    pressure_points = [
        {
            "title": "Fixed commitment pressure",
            "detail": f"About {_format_currency(fixed_monthly)} per month looks non-negotiable, so your savings room mainly comes from discretionary spend.",
        },
        {
            "title": "Discretionary opportunity",
            "detail": f"You spend about {_format_currency(discretionary_monthly)} per month on discretionary categories.",
        },
        {
            "title": "Deadline pressure",
            "detail": f"To hit this goal, you need {_format_currency(weekly_target)} each week for {weeks_left} weeks.",
        },
    ]

    linked_transactions = []
    linked_source = sorted(
        [tx for tx in debit_transactions if tx["behavior_class"] in {"discretionary", "fixed_commitment"}],
        key=lambda item: item["amount"],
        reverse=True,
    )[:6]
    for tx in linked_source:
        linked_transactions.append(
            {
                "memory_id": tx["memory_id"],
                "merchant": tx["merchant"],
                "category": tx["category"],
                "amount": tx["amount"],
                "date": tx["date"],
                "behavior_class": tx["behavior_class"],
            }
        )

    potential_monthly_cut = sum(item["suggested_cut"] for item in conflict_categories)
    suggested_weekly_savings = potential_monthly_cut / 4.0
    feasibility_ratio = suggested_weekly_savings / weekly_target if weekly_target else 1.0

    if feasibility_ratio >= 1:
        feasibility = "Strong"
    elif feasibility_ratio >= 0.7:
        feasibility = "Possible with discipline"
    else:
        feasibility = "Needs either more time or a lower target"

    confidence = min(95, max(35, int(feasibility_ratio * 100)))

    plan_steps = [
        f"Protect {_format_currency(weekly_target)} each week for {weeks_left} weeks.",
        f"Start by reducing {conflict_categories[0]['category'].replace('_', ' ')} by {_format_currency(conflict_categories[0]['suggested_cut'])} per month." if conflict_categories else "Start by reducing the biggest discretionary category first.",
        "Review repeat merchants before touching essentials or fixed commitments.",
        "Use salary week as a no-spike zone so the goal money is moved out before it gets spent.",
    ]

    return {
        "goal": {
            "goal_text": selected_goal["goal_text"],
            "target_amount": round(target, 2),
            "deadline": selected_goal.get("deadline"),
            "weeks_left": weeks_left,
            "weekly_target": round(weekly_target, 2),
            "feasibility": feasibility,
        },
        "summary": {
            "monthly_average_spend": round(monthly_average_spend, 2),
            "monthly_average_income": round(monthly_average_income, 2),
            "discretionary_monthly": round(discretionary_monthly, 2),
            "fixed_monthly": round(fixed_monthly, 2),
            "suggested_weekly_savings": round(suggested_weekly_savings, 2),
            "confidence": confidence,
        },
        "pressure_points": pressure_points,
        "conflict_categories": conflict_categories,
        "linked_transactions": linked_transactions,
        "plan_steps": plan_steps,
    }


def get_hubs(limit: int = 10) -> dict:
    graph = get_memory_graph_data()
    category_nodes = [node for node in graph["nodes"] if node["type"] == "category"][:limit]
    return {"hubs": category_nodes}


def get_neighborhood(memory_id: str, hops: int = 2) -> dict:
    graph = get_memory_graph_data()
    related_edges = [edge for edge in graph["edges"] if edge["source"] == memory_id or edge["target"] == memory_id]
    node_ids = {memory_id}
    for edge in related_edges:
        node_ids.add(edge["source"])
        node_ids.add(edge["target"])
    nodes = [node for node in graph["nodes"] if node["id"] in node_ids]
    return {"memory_id": memory_id, "nodes": nodes, "edges": related_edges, "hops": hops}


def find_path(from_id: str, to_id: str) -> dict:
    graph = get_memory_graph_data()
    direct = [edge for edge in graph["edges"] if {edge["source"], edge["target"]} == {from_id, to_id}]
    return {"from": from_id, "to": to_id, "path": direct}


def get_stats() -> dict:
    transactions = _get_transactions()
    goals = _get_goals()
    events = _get_life_events()
    return {
        "total_memories": len(_load_db()),
        "transactions": len(transactions),
        "goals": len(goals),
        "life_events": len(events),
        "months": len({tx["month"] for tx in transactions}),
    }


def health_check() -> bool:
    return True


if __name__ == "__main__":
    print(f"Mem-Brain Local Override active. DB Size: {len(_load_db())}")
