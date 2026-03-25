# Deployment Guide: FDE Graph Explorer

The project is split into a **Node.js/Express Backend** and a **Vite/React Frontend**. The following guide covers deployment to common cloud platforms.

## 1. Backend Deployment (Render / Heroku / Railway)

### Prerequisites
- **PostgreSQL Database**: You will need a managed database (e.g., Render PostgreSQL, Supabase, or AWS RDS).
- **Environment Variables**: Configure these in your hosting provider's dashboard:
    - `DB_HOST`: Your remote host (e.g., `db.example.com`)
    - `DB_NAME`: Your database name
    - `DB_USER`: Your username
    - `DB_PASSWORD`: Your password
    - `OPENROUTER_API_KEY`: Your key for AI queries
    - `PORT`: `3000` (or the provider's default)

### Steps (Example: Render.com)
1. **Create New Web Service**: Link your GitHub repo.
2. **Root Directory**: `backend`
3. **Build Command**: `npm install`
4. **Start Command**: `node src/app.js`
5. **Add Secrets**: Copy-paste your `.env` values into the "Environment Variables" section.

---

## 2. Frontend Deployment (Vite)

### Prerequisites
- Ensure the backend is deployed FIRST so you have a public URL.

### Steps
1. **Update Connection**: In the frontend source code (usually `App.jsx` or a config file), change the `BASE_URL` from `localhost:3000` to your public backend URL.
2. **Build**: Run `npm run build` locally or let the host build it.
3. **Example: Vercel / Netlify**
    - **Root Directory**: `frontend`
    - **Build Command**: `npm run build`
    - **Output Directory**: `dist`

---

## 3. Database Migration
Ensure you have created the required tables in your Production database. You can run the initial SQL dump or use a tool like DBeaver to copy the schema from your local `fde_db`.

## 4. Key Deployment Decisions
- **Backend**: Needs to be a Persistent Service (cannot use Vercel/Netlify Functions unless refactored).
- **Frontend**: Can be hosted on any static site provider.
- **Port Matching**: Ensure the frontend's API calls point to the correct deployed backend port/URL.
