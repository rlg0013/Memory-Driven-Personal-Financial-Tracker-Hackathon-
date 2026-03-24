import json
import re
from datetime import datetime

from memory_graph import search, search_interpreted

# ── Regex patterns ────────────────────────────────────────────────────────────

DEBIT_RE = [
    r"INR\s?([\d,]+\.?\d*)\s+debited",
    r"Rs\.?\s?([\d,]+\.?\d*)\s+debited",
    r"debited\s+(?:by|of)?\s+(?:INR|Rs\.?)\s?([\d,]+\.?\d*)",
    r"(?:INR|Rs\.?)\s?([\d,]+\.?\d*)\s+(?:spent|paid|deducted)",
]

CREDIT_RE = [
    r"INR\s?([\d,]+\.?\d*)\s+credited",
    r"Rs\.?\s?([\d,]+\.?\d*)\s+credited",
    r"(?:received|credit(?:ed)?)\s+(?:INR|Rs\.?)\s?([\d,]+\.?\d*)",
]

MERCHANT_RE = [
    r"(?:at|to|via UPI to)\s+([A-Z][A-Z0-9\s&\-]+?)(?:\s+on|\s+Avl|\s+Ref|\.|\n|$)",
    r"(?:for|towards)\s+([A-Z][A-Z0-9\s&\-]+?)(?:\s+on|\s+Avl|\.|$)",
]

BALANCE_RE = r"Avl\.?\s*Bal(?:ance)?[:\s]+(?:INR|Rs\.?)\s?([\d,]+\.?\d*)"

# Static category map — fast lookup for known merchants
CATEGORY_MAP = {
    "ZOMATO": "food_delivery",
    "SWIGGY": "food_delivery",
    "AMAZON": "shopping",
    "FLIPKART": "shopping",
    "MYNTRA": "shopping",
    "MEESHO": "shopping",
    "SPOTIFY": "entertainment",
    "NETFLIX": "entertainment",
    "HOTSTAR": "entertainment",
    "PRIME": "entertainment",
    "BIG BAZAAR": "groceries",
    "DMART": "groceries",
    "BLINKIT": "groceries",
    "ZEPTO": "groceries",
    "DECATHLON": "fitness",
    "CULT": "fitness",
    "MAKEMYTRIP": "travel",
    "GOIBIBO": "travel",
    "IRCTC": "travel",
    "OLA": "travel",
    "UBER": "travel",
    "RAPIDO": "travel",
    "EMI": "emi",
    "LOAN": "emi",
    "SALARY": "income",
    "CREDITED": "income",
    "ELECTRICITY": "utilities",
    "BESCOM": "utilities",
    "BBMP": "utilities",
    "AIRTEL": "utilities",
    "JIO": "utilities",
    "BSNL": "utilities",
    "HOSPITAL": "healthcare",
    "PHARMACY": "healthcare",
    "APOLLO": "healthcare",
    "MEDPLUS": "healthcare",
}


def _regex_parse(text: str) -> dict:
    result = {
        "amount": None,
        "type": None,
        "merchant": None,
        "category": None,
        "balance": None,
    }

    for pat in DEBIT_RE:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["amount"] = float(m.group(1).replace(",", ""))
            result["type"] = "debit"
            break

    if not result["amount"]:
        for pat in CREDIT_RE:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                result["amount"] = float(m.group(1).replace(",", ""))
                result["type"] = "credit"
                break

    for pat in MERCHANT_RE:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["merchant"] = m.group(1).strip().upper()
            break

    bal_m = re.search(BALANCE_RE, text, re.IGNORECASE)
    if bal_m:
        result["balance"] = float(bal_m.group(1).replace(",", ""))

    # Static category lookup
    if result["merchant"]:
        for key, cat in CATEGORY_MAP.items():
            if key in result["merchant"]:
                result["category"] = cat
                break

    return result


def _membrain_categorize(merchant: str) -> str | None:
    """
    Ask Mem-Brain if it already knows this merchant's category.
    Uses the interpreted search — if Mem-Brain has seen this merchant
    before, it returns a summary that includes the category.
    """
    try:
        result = search_interpreted(
            query=f"What category is {merchant}? What kind of merchant or service is it?",
            k=5,
            keyword_filter=f"merchant\\.{merchant.lower().replace(' ', '_')}",
        )
        if result and "No relevant memories" not in result:
            # Simple heuristic: look for known category names in the summary
            for cat in [
                "food_delivery",
                "groceries",
                "shopping",
                "entertainment",
                "travel",
                "fitness",
                "emi",
                "income",
                "utilities",
                "healthcare",
            ]:
                if cat.replace("_", " ") in result.lower() or cat in result.lower():
                    return cat
    except Exception:
        pass
    return None


def _llm_enrich(text: str, partial: dict) -> dict:
    """
    Last resort: use Claude to fill missing fields.
    Only called when regex AND Mem-Brain both fail to find category/merchant.
    """
    try:
        from anthropic import Anthropic

        client = Anthropic()

        prompt = f"""Parse this Indian bank SMS and return ONLY a JSON object.

SMS: "{text}"

Known so far: amount={partial.get("amount")}, type={partial.get("type")}, merchant={partial.get("merchant")}

Return JSON with these exact keys:
{{
  "merchant": "merchant name in UPPERCASE or null",
  "category": "one of: food_delivery, groceries, shopping, entertainment, travel, fitness, emi, income, utilities, healthcare, education, other",
  "context_note": "5-8 word description of what this spend was"
}}

JSON only. No explanation."""

        response = client.messages.create(
            model="claude-3-5-haiku-20241022",  # cheapest/fastest for parsing
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        enriched = json.loads(response.content[0].text.strip())

        if not partial.get("merchant"):
            partial["merchant"] = enriched.get("merchant")
        if not partial.get("category"):
            partial["category"] = enriched.get("category")
        partial["context_note"] = enriched.get("context_note", "")
        partial["parsed_by"] = "regex+llm"

    except Exception as e:
        print(f"  ⚠ LLM enrich failed: {e}")
        partial["context_note"] = ""
        partial["parsed_by"] = "regex"

    return partial


def parse_sms(text: str, date: str = None) -> dict:
    """
    Parse one SMS message.
    Pipeline: regex → Mem-Brain category lookup → Claude (last resort)
    """
    result = _regex_parse(text)
    result["raw"] = text
    result["date"] = date or datetime.now().strftime("%Y-%m-%d")
    result["timestamp"] = datetime.now().isoformat()
    result["parsed_by"] = "regex"

    # Try Mem-Brain for category if regex missed it
    if not result["category"] and result["merchant"]:
        mb_cat = _membrain_categorize(result["merchant"])
        if mb_cat:
            result["category"] = mb_cat
            result["parsed_by"] = "regex+membrain"

    # Last resort: Claude
    if not result["category"] or not result["merchant"]:
        result = _llm_enrich(text, result)

    # Final fallback
    if not result["category"]:
        result["category"] = "other"
    if not result.get("context_note"):
        result["context_note"] = ""

    return result


def parse_sms_batch(sms_list: list[dict]) -> list[dict]:
    """Parse a list of {id, text, date} dicts."""
    parsed = []
    for sms in sms_list:
        result = parse_sms(sms["text"], sms.get("date"))
        result["sms_id"] = sms.get("id")
        parsed.append(result)
        tag = f"[{result['parsed_by']}]"
        print(
            f"  {tag} ₹{result.get('amount')} @ {result.get('merchant')} → {result.get('category')}"
        )
    return parsed


if __name__ == "__main__":
    tests = [
        {
            "id": "t1",
            "text": "INR 450.00 debited from A/C XX1234 at ZOMATO on 2026-01-03. Avl Bal: INR 12,340.00",
            "date": "2026-01-03",
        },
        {
            "id": "t2",
            "text": "INR 15,000.00 credited to A/C XX1234. Salary Jan 2026. Avl Bal: INR 22,490.00",
            "date": "2026-01-15",
        },
        {
            "id": "t3",
            "text": "Rs. 299 debited for Netflix subscription renewal",
            "date": "2026-01-20",
        },
    ]
    print("=== SMS Parser Test ===\n")
    results = parse_sms_batch(tests)
    print("\n=== Output ===")
    print(json.dumps(results, indent=2, default=str))
