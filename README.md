# FDE Graph Explorer 🚀

An AI-powered graph visualization and query system for exploring complex relational business data (Orders, Deliveries, Billing, and Journal Entries).

## 🏛 Architecture Decisions

### 1. Hybrid Query Engine (LLM + Keyword Rules)
- **Problem**: LLMs can hit rate limits (429) or generate hallucinations in complex business logic.
- **Solution**: A tiered execution flow.
  1. **Primary**: LLM (OpenRouter/Gemini 2.0) translates natural language to SQL.
  2. **Secondary**: If the query is simple or the AI is rate-limited, a high-performance **Keyword Rule engine** provides deterministic fallbacks for common entities like "Top Customers" or "All Orders."
  3. **Summarization**: Results are passed back to the LLM for a human-readable summary, using conversation history for context.

### 2. Force-Directed Graph Visualization
- Uses `react-force-graph-2d` to represent business relationships as an interactive web.
- Nodes represent entities (Business Partners, Orders) and edges represent business links (Sold-to, Billed-to).
- Optimized for performance with dynamic node loading.

## 🗄 Database Choice: PostgreSQL
- **Rationale**: While the visualization is a graph, the underlying data (SAP-style business objects) is inherently relational. 
- **Graph Transformation**: We transform the relational schema into a graph structure at the API layer, allowing us to maintain ACID compliance and perform complex joins efficiently while presenting a connected-data experience to the user.

## 🧠 LLM Prompting & Truncation Strategy

### 1. Optimized Schema Passing
- Instead of sending the full raw schema (which consumes tokens and causes 429 errors), we send a **compacted domain schema** containing only the critical fields for joins (Sales Order ➔ Delivery ➔ Billing ➔ Journal Entry).

### 2. Smart Data Truncation
- **Input Control**: If a database result is too large (e.g., "show all 50,000 orders"), the system truncates the JSON data before sending it to the LLM for summarization. 
- **Context Preservation**: We send a representative sample (top 15 records) and a summary count, preventing token overflow while still providing accurate high-level insights.

### 3. Precision SQL Generation
- Prompts include specific rules for **Double Quoting** (PostgreSQL case-sensitivity) and instruction to never fabricate filter values unless explicitly mentioned by the user.

## 🛡 Guardrails & Security

### 1. Two-Layer Classification
- Every query passes through an **LLM Classifier** first.
- If the question is off-topic (e.g., "Write a poem" or "Who won the World Cup?"), the system rejects it with:
  > *"This system is designed to answer questions related to the provided dataset only."*

### 2. SQL Safety Filter
- A programmatic bridge (`sqlSafety.js`) scans the AI-generated SQL before execution.
- **Blocklist**: Only `SELECT` statements are allowed. `UPDATE`, `DELETE`, `DROP`, and `TRUNCATE` are blocked at the code level.
- **Auto-Limit**: Every query is automatically appended with a `LIMIT 200` to prevent database memory exhaustion from unbounded selects.

## 🛠 Tech Stack
- **Frontend**: Vite, React, Tailwind CSS, React Force Graph.
- **Backend**: Node.js, Express, PostgreSQL.
- **AI**: OpenRouter (Gemini 2.0 Flash), Gemini Native, Groq (Llama 3.3).
