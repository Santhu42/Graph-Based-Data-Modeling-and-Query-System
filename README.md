# FDE Graph Explorer 🚀

An AI-powered graph visualization and query system for exploring complex relational business data (Orders, Deliveries, Billing, and Journal Entries). This platform bridges the gap between traditional SQL databases and intuitive graph-based exploration.

## 🌐 Live Application
- **Frontend (UI):** [https://fde-frontend.onrender.com/](https://fde-frontend.onrender.com/)
- **Backend (API):** [https://fde-backend.onrender.com/api/graph](https://fde-backend.onrender.com/api/graph)

## 🏗 Architecture Overview

The system uses a tiered architecture to ensure accuracy, safety, and performance when querying relational data with natural language.

```mermaid
graph TD
    A[Frontend: React/Vite/Force-Graph] -- Natural Language Query --> B[Backend: Node.js/Express]
    B -- 1. Local Guardrail (Regex) --> C{Off-topic?}
    C -- YES --> D[Rejection Message]
    C -- NO --> E[2. LLM Classifier]
    E -- Off-topic --> D
    E -- On-topic --> F[3. SQL Generator (Gemini/Groq)]
    F -- Raw SQL --> G[4. SQL Safety Bridge]
    G -- Safe SELECT --> H[(PostgreSQL: Render)]
    H -- JSON Data --> I[5. Answer Generator (AI Summary)]
    I -- Human Response + Highlights --> A
    A -- Interactive Node Selection --> J[Graph Expansion]
```

## 🏟 Key Capabilities

### 1. Hybrid Query Engine (LLM + Keyword Rules)
- **Primary Path**: High-precision SQL generation using Gemini 2.0 and Groq to translate complex business questions into efficient PostgreSQL queries.
- **Deterministic Fallback**: A library of structured keyword rules handles high-frequency queries (e.g., *"Show latest orders"*) with zero latency, even if the AI is rate-limited.
- **Narrative Summarization**: Every data result is summarized into a natural human response, highlighting key insights like top customers or high-value orders.

### 2. Relational-to-Graph Virtualization
- **Graph Transformation Layer**: The platform maps a standard SQL relational schema (PK/FK) into a dynamic graph structure at runtime.
- **Force-Directed Viz**: Uses D3-powered force simulation to visualize business flows (Sales Order ➔ Delivery ➔ Billing) as connected nodes.
- **On-Demand Expansion**: Clicking a node fetches its neighbor's data from the relevant tables, allowing users to "crawl" through the business supply chain.

### 🧠 Domain Guardrails & Safety
- **Strict Domain Locking**: Unlike generic AI, this system flatly rejects unrelated queries. Questions like *"Who is Einstein?"* or *"Write a poem"* are caught by both regex and LLM-based classifiers.
- **Read-Only execution**: A mandatory safety bridge (`sqlSafety.js`) validates all AI-generated SQL to ensure it only performs `SELECT` operations and enforces row limits to prevent database strain.

## 🛠 Tech Stack
- **UI**: React 18, Vite, Tailwind CSS, Lucide Icons, `react-force-graph-2d`.
- **Backend**: Node.js, Express, `pg` (node-postgres).
- **Database**: PostgreSQL (Render.com) with relational-graph linkage.
- **AI Integration**: OpenRouter (Unified API for Gemini and Llama 3 models).
- **Hosting**: Render.com (Auto-deploy via GitHub).

## 📊 Dataset Focus
Current schema supports deep tracing across:
- **Sales**: Orders, Items, Customer Profiles.
- **Logistics**: Deliveries, Shipping Plants, Picking statuses.
- **Finance**: Billing Documents, Accounting Records, Payment status.
