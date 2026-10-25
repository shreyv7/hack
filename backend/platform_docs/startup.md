# 🚀 ZEROSHIELD DPDPA — Startup Guide

This document outlines the commands to start the backend services, database, and frontend of the ZEROSHIELD DPDPA project.

---

## 1. Prerequisites & Environment
Ensure the environment files are set up:
- **Backend Environment**: Check/configure `dpdpa_shield/backend/.env`.
- **Frontend Environment**: Check/configure `dpdpa_shield/frontend/.env.local`.

---

## 2. Start PostgreSQL Database (Docker)
We run PostgreSQL inside Docker but run the application processes locally for faster reload and debugging.

Run the following command from the `dpdpa_shield/backend` directory:
```bash
docker compose -f docker-compose.db.yml up -d
```

---

## 3. Run Database Migrations
Ensure the database schema is fully updated to the latest revision.

Run the following command from the `dpdpa_shield/backend` directory:
```bash
.venv/bin/alembic upgrade head
```

---

## 4. Start the Backend API Server
Start the FastAPI backend with uvicorn and reload mode enabled.

Run the following command from the `dpdpa_shield/backend` directory:
```bash
.venv/bin/uvicorn app.main:app --reload --port 8002
```
- **API URL**: [http://localhost:8002](http://localhost:8002)
- **API Health Check**: [http://localhost:8002/api/health](http://localhost:8002/api/health)
- **Swagger Docs**: [http://localhost:8002/docs](http://localhost:8002/docs)

---

## 5. Start the Frontend Server
Since `pnpm` is not in the system PATH, use `npm` to run the frontend dev server.

Run the following command from the `dpdpa_shield/frontend` directory:
```bash
npm run dev
```
- **Frontend URL**: [http://localhost:5173](http://localhost:5173)
