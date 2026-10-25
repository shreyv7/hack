# DPDPA Shield

Monorepo for the **DPDPA Shield** compliance platform: React frontend and FastAPI backend.

## Project structure

```
.
├── frontend/          # Vite + React + TypeScript (UI)
├── backend/           # FastAPI + PostgreSQL + SQLAlchemy (API)
├── packages/          # Shared libraries (e.g. zeroshield-python SDK)
├── docs/              # Product documentation
├── guidelines/        # Design / product guidelines
├── package.json       # Root scripts (delegates to frontend)
└── pnpm-workspace.yaml
```

> **Note:** This repo lives inside the outer `ZEROSHIELD-DPDPA` workspace wrapper.
> The legacy root-level `app/`, `src/`, and `alembic/` directories were removed —
> all development happens in `frontend/` and `backend/`.

## Frontend

```bash
# From repo root
pnpm install
pnpm dev

# Or from frontend/
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check |

See [frontend/README.md](frontend/README.md) for UI-specific notes.

## Backend

```bash
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

See [backend/README.md](backend/README.md) for database setup, Alembic migrations, and Docker options.

## Dead-code analysis

Run periodically to catch unused code before it accumulates:

```bash
# Frontend (from repo root)
pnpm dead-code:frontend    # knip + depcheck via npx

# Backend (requires venv with vulture + deptry installed)
pnpm dead-code:backend

# Latest audit report
docs/internal/dead-code-audit-20260727.md
```

Install backend tooling once:

```bash
cd backend && .venv/bin/pip install vulture deptry
```

## Environment variables

| Package | Template | Local file (gitignored) |
|---------|----------|-------------------------|
| Backend | `backend/.env.example` | `backend/.env` |
| Frontend | `frontend/.env.example` | `frontend/.env.local` |

Use **your own** database password and SMTP credentials in local `.env` files only. Do not put real passwords in `.env.example` or any committed file.

## Development

- **Design reference:** Figma export may be kept locally in `.figma-export/` (gitignored).


graph TD
    %% Styling and Configuration
    classDef uiBox fill:#f9f9fb,stroke:#333,stroke-width:2px,color:#000;
    classDef actionBtn fill:#2563eb,stroke:#1e40af,stroke-width:1px,color:#fff;
    classDef rejectBtn fill:#ef4444,stroke:#991b1b,stroke-width:1px,color:#fff;
    classDef textLink fill:#f3f4f6,stroke:#4b5563,stroke-dasharray: 5 5,color:#1f2937;
    classDef system fill:#059669,stroke:#065f46,stroke-width:2px,color:#fff;

    %% --- SCREEN 1: THE INITIAL BANNER ---
    subgraph S1 [UI SCREEN 1: Primary Consent Banner Layer]
        S1_Title["<b>Privacy Preference Center</b><br/>(Mandatory DPDPA Section 5 Notice Overview)"] 
        --> S1_Lang["🌐 [Dropdown: Select Language (Default: English / 22 Schedule VIII Languages)]"]
        --> S1_Desc["'We process data based on your specific selections below. You can change choices or withdraw consent at any time.'"]
        
        %% Granular Choices
        subgraph S1_Choices [Granular Purpose Selection]
            S1_C1["[ ] <b>Health Data Processing</b><br/>Purpose: Provide prescription tracking & telehealth."]
            S1_C2["[ ] <b>Marketing Analytics</b><br/>Purpose: Site optimization and behavioral metrics."]
        end
        
        %% Links and Buttons
        S1_Link["🔗 <u>View Rights Portal & DPO Contact</u>"] :::textLink
        S1_BtnReject["[ REJECT ALL ]"] :::rejectBtn
        S1_BtnAccept["[ ACCEPT SELECTED ]"] :::actionBtn
    end
    class S1,S1_Choices uiBox;

    %% --- SCREEN 2: EXPANDED RIGHTS & DPO PORTAL ---
    subgraph S2 [UI SCREEN 2: Rights & Privacy Portal Layer]
        S2_Title["<b>Data Principal Rights Dashboard</b>"]
        --> S2_DPO["<b>Central Grievance Redressal</b><br/>Unified DPO Office: dpo@yourcompany.com<br/>(Internal routing handles Health vs Marketing teams behind the scenes)"]
        --> S2_DPBI["<b>Statutory Right:</b> If unresolved, you may lodge a complaint directly with the <u>Data Protection Board of India (DPBI)</u>."]
        --> S2_Withdraw["<b>Consent Management:</b> Clear 'Withdraw Consent' toggles for previously accepted items."]
        --> S2_BtnBack["[ ← Return to Banner ]"] :::actionBtn
    end
    class S2 uiBox;

    %% --- SYSTEM LOGGING LAYER ---
    subgraph S3 [Backend System Layer - Audit Trail]
        S3_Log["<b>Immutable Consent Registry</b><br/>Logs: Timestamp, Lang Selected, Checkbox States, Notice Version Verbatim."] :::system
    end

    %% --- INTERACTION & USER FLOW LOGIC ---
    S1_Link -->|User clicks link| S2
    S2_BtnBack -->|User returns| S1

    S1_BtnReject -->|Action: Blocks all non-essential scripts| S3_Log
    S1_BtnAccept -->|Action: Evaluates which checkboxes are explicitly active| S1_Eval{Evaluating<br/>State}
    
    S1_Eval -->|Only Box 1 Checked| Act_Health["Activate Health Services Data Pipeline<br/>(Marketing remains blocked)"]
    S1_Eval -->|Only Box 2 Checked| Act_Mktg["Activate Web Analytics Cookies<br/>(Health remains blocked)"]
    S1_Eval -->|Both Checked| Act_Both["Activate Both Data Pipelines"]

    Act_Health & Act_Mktg & Act_Both -->|Triggers Legal Receipt generation| S3_Log