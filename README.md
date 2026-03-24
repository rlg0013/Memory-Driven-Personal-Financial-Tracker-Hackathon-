# HisaabAI 🧠💰
### Memory-Driven Personal Finance Consultant

Built on **Alpha Nimble Mem-Brain** — a living memory graph that turns your SMS alerts into financial intelligence.

---

## Quick Start (Hackathon Setup)

### 1. Clone & install
```bash
cd backend
pip install -r requirements.txt
```

### 2. Set environment variables
```bash
cp .env.example .env
# Fill in your MEM_BRAIN_URL and ANTHROPIC_API_KEY
```

### 3. Start the backend
```bash
cd backend
uvicorn main:app --reload --port 8080
```

### 4. Load seed data
```bash
curl -X POST http://localhost:8080/sms/ingest \
  -H "Content-Type: application/json" \
  -d @data/mock_sms_payload.json
```

### 5. Open API docs
```
http://localhost:8080/docs
```

---

## Key API Endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| POST | `/sms/ingest` | Bulk ingest SMS messages → Mem-Brain |
| POST | `/sms/single` | Parse + store a single SMS |
| POST | `/goal` | Store a financial goal |
| GET | `/report/2026-01` | AI monthly report |
| GET | `/patterns` | Detect spending patterns |
| POST | `/plan` | Generate savings plan |
| POST | `/chat` | Conversational finance assistant |

---

## Project Structure

```
hisaabai/
├── backend/
│   ├── main.py           # FastAPI app
│   ├── sms_parser.py     # Regex + LLM SMS extraction
│   ├── memory_graph.py   # Mem-Brain API wrapper
│   ├── agent.py          # Pattern detection + savings planner
│   └── requirements.txt
├── frontend/             # React dashboard (Phase 3)
├── data/
│   └── mock_sms.json     # 2 months of sample data
├── docker-compose.yml
└── .env.example
```

---

## How Mem-Brain Powers This

Each SMS becomes a **memory node** with semantic embeddings.
The Guardian automatically links nodes by:
- **Causality** → stress → late-night orders
- **Pattern** → month-end spending spikes  
- **Dependency** → EMI dates → reduced discretionary spend

When you ask "Why do my savings plans fail?", the agent traverses
the graph via multi-hop reasoning — connecting your spending events,
life context, and goal history into one coherent answer.

That's the delta between HisaabAI and a spreadsheet.

---

## Demo Script (2 min pitch)

1. Show SMS ingestion → graph building live
2. Ask: *"Where am I spending the most?"* → contextual, not just pie charts
3. Say: *"I want to go to Goa in 6 weeks"* → personalized savings plan
4. Show Month 1 vs Month 2 insight quality → **the graph got smarter**

---

*"Every rupee you spend has a story. HisaabAI remembers all of them."*
