# 🐳 Docker Setup & Development Modes Guide

This document describes how to configure, build, and run the **ZeroShield DPDPA** application using Docker. It is designed to get new developers onboarded quickly with a functional database and container environment.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Docker Desktop** (version 20.10+): [Download here](https://www.docker.com/products/docker-desktop/)
2. **Python 3.12+** (if running in Hybrid mode): [Download here](https://www.python.org/downloads/)
3. **Node.js v20+ & pnpm** (if running in Hybrid mode): [Download here](https://pnpm.io/installation)

---

## 🛠️ Service Architecture & Default Ports

The application consists of three main containers wired together via a shared docker bridge network:

| Service | Port | Image / Source | Purpose |
|---|---|---|---|
| `db` | `5432` | `postgres:16` | Relational database storage |
| `backend` | `8000` | [backend/Dockerfile](file:///Users/shreyvashistha/Desktop/ZEROSHIELD-DPDPA/dpdpa_shield/backend/Dockerfile) | FastAPI API server & migrations |
| `frontend` | `80` | [frontend/Dockerfile](file:///Users/shreyvashistha/Desktop/ZEROSHIELD-DPDPA/dpdpa_shield/frontend/Dockerfile) | Nginx serving React production bundle |

---

## 🚀 Mode 1: Fully Containerized Mode (Staging / Production Simulation)

In this mode, all services run inside Docker containers. This is the closest simulation to staging/production and is ideal for verifying clean builds, system behavior, or showing demos.

### Step 1 — Prepare Environment Files
Copy the template files to create local `.env` configurations:
```bash
# Copy backend env example
cp backend/.env.example backend/.env
```

### Step 2 — Start the Containers
From the root directory (`dpdpa_shield/`), run:
```bash
docker compose up -d --build
```
This builds the frontend and backend images, initializes the postgres database volume, runs all Alembic migrations automatically, and brings up the services.

Shield AI in Docker uses **Vertex AI via ADC**. Compose mounts your host file:

`%APPDATA%\gcloud\application_default_credentials.json`

Create it first with `gcloud auth application-default login` (already done if the ADC setup script succeeded). To point at a different file:

```powershell
$env:GOOGLE_ADC_HOST="C:\path\to\application_default_credentials.json"
docker compose up -d --build
```

After the backend is healthy, probe Vertex from inside the container:

```powershell
docker exec dpdpa_backend python -m app.scripts.test_ai_provider
```

### Step 3 — Seed Demo Data
To explore the application with loaded details, run the master seeding script inside the backend container:
```bash
# 1. Copy the seeding script into the container
docker cp backend/app/scripts/seed_entire_db.py dpdpa_backend:/app/app/scripts/seed_entire_db.py

# 2. Run the seeder to create default organizations, users, and compliance data
docker exec -it dpdpa_backend python -m app.scripts.seed_entire_db
```
> [!NOTE]
> This creates a default organization **ZeroShield Sandbox Org** and configures an admin user account:
> - **Email**: `shrey07feb@gmail.com`
> - **Password**: `Shrey@26`

### Step 4 — Access the App
Open your browser at:
- **Frontend App**: [http://localhost](http://localhost)
- **Interactive API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Shutdown
To stop the container stack and network boundaries, run:
```bash
docker compose down
```

---

## ⚡ Mode 2: Hybrid Local Development Mode (Hot Reload / Live Updates)

In this mode, you run **only the database** inside a Docker container. The backend (FastAPI) and frontend (Vite/React) are run locally on the host machine. 
This is the **recommended** method for daily development because it provides:
- **Instant Frontend Hot Reloading (HMR)**: Powered by Vite.
- **Fast Backend Auto-Restart**: Uvicorn reloads instantly when Python files are modified.
- **Easy Debugging**: Run print statements or attach debuggers directly inside VS Code / PyCharm.

### Step 1 — Start only the Database
Spin up the containerized database:
```bash
docker compose -f backend/docker-compose.db.yml up -d
```
This maps Postgres to `localhost:5432` on your machine.

### Step 2 — Set up & start the Backend locally
Configure your local environment and run the API:
```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations to build the local schema
alembic upgrade head

# Start API with auto-reload enabled
uvicorn app.main:app --reload
```

### Step 3 — Set up & start the Frontend locally
Configure dependencies and run the Vite dev server:
```bash
cd frontend

# Install dependencies
pnpm install

# Start local server with hot module replacement (HMR)
pnpm dev
```

### Step 4 — Access the App
Open your browser at:
- **Frontend App (Dev Server)**: [http://localhost:5173](http://localhost:5173)
- **API (Swagger Docs)**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Shutdown DB
To shut down the database container, run:
```bash
docker compose -f backend/docker-compose.db.yml down
```

---

## 🛠️ Handy Docker Commands for Developers

### Viewing Logs
```bash
# View backend logs in real-time
docker logs -f dpdpa_backend

# View frontend logs in real-time
docker logs -f dpdpa_frontend
```

### Accessing Database CLI
```bash
docker exec -it dpdpa_postgres psql -U dpdpa -d dpdpa_shield
```

### Rebuilding from Scratch (Clearing cache)
If you make configuration changes to `package.json` or `requirements.txt` and want a clean state:
```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```
