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

---

## 🚀 Setup & Local Development

Follow these steps to run the FDE Graph Explorer on your local machine.

### 📋 Prerequisites
- **Node.js** (v18 or higher)
- **PostgreSQL** (Local installation or a remote instance like Render/RDS)
- **API Key**: An [OpenRouter](https://openrouter.ai/) API key for the AI-powered query engine.

### 1. Clone the Repository
```bash
git clone https://github.com/Santhu42/Graph-Based-Data-Modeling-and-Query-System.git
cd Graph-Based-Data-Modeling-and-Query-System
```

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/fde_db
OPENROUTER_API_KEY=your_key_here
PORT=3000
```

For the frontend, create `.env.local` in the `frontend/` directory (if you want to target a custom API URL):

```env
VITE_API_BASE_URL=http://localhost:3000
```

### 3. Install Dependencies
Run this in the root, then in both sub-directories:

```bash
# In the root
npm install

# In the backend
cd backend && npm install

# In the frontend
cd ../frontend && npm install
```

### 4. Seed the Database
Ensure your PostgreSQL instance is running. Then, run the data loader from the root:

```bash
# Use current .env if you've configured it at the root 
# Or pass the DB URL directly in your terminal
npm run load
```

### 5. Start the Services

**Run the Backend (API)**:
```bash
cd backend
npm run dev
```

**Run the Frontend (UI)**:
```bash
cd frontend
npm run dev
```

The application will be available at [http://localhost:5173/](http://localhost:5173/).
