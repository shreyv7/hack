# Vajra — Vajra AI Technical Specification

This document serves as the **single source of truth** for the **Vajra AI** compliance copilot of the Vajra DPDPA compliance platform.

**Route:** `/ai/copilot`

---

## 1. Module Overview

### 1.1 Purpose
**Vajra AI** is an in-product AI compliance assistant that helps users navigate DPDPA requirements, understand platform features, and take action on their compliance posture — powered by AWS Bedrock with retrieval-augmented generation (RAG) over platform documentation.

### 1.2 Business Objective
To reduce the time from platform onboarding to compliance readiness by providing instant, context-aware guidance — without requiring users to read lengthy documentation or wait for support tickets.

### 1.3 Capabilities
Vajra AI has two areas of expertise:
1. **DPDPA Legal Knowledge** — cite section numbers, explain obligations, draft templates.
2. **Platform Navigation** — step-by-step guidance through Vajra features using indexed platform documentation.

### 1.4 Architectural Context

```mermaid
graph TD
    User[User] -->|Chat message| Copilot[Vajra AI UI]
    Copilot -->|POST /api/ai/conversations/{id}/messages/stream| API[Vajra AI Router]
    API -->|Retrieve context| RAG[Embedding Service + doc_embeddings]
    API -->|Workspace data| Ctx[AiContextService]
    API -->|Generate| Bedrock[AWS Bedrock Converse API]
    Bedrock -->|Stream response| Copilot
    Docs[docs/ folder] -->|Ingest| Ingestion[DocIngestionService]
    Ingestion -->|Embed + store| RAG
```

### 1.5 Target Users
*   **All authenticated users** — general DPDPA questions and platform guidance.
*   **DPOs / Compliance teams** — compliance posture summaries, gap analysis, template drafting.
*   **Superadmins** — trigger documentation re-indexing for RAG updates.

---

## 2. User Interface

### 2.1 Layout
Full-screen chat workspace (top bar hidden) with three panels:

**Left Sidebar — Conversation History**
*   New conversation button
*   Conversations grouped by: Today, Yesterday, Previous 7 days, Older
*   Search conversations
*   Delete conversation

**Center — Chat Workspace**
*   Message thread with markdown rendering
*   Streaming response with typing indicator
*   Suggestion chips: "Summarize this month's consent posture", "Draft a DSAR response template", "What are our top compliance risks?", "Explain DPDPA breach notification timelines"
*   Stop generation button

**Right Panel — Context (toggleable)**
*   "Use company data" toggle — includes live workspace context in prompts
*   Current data access snapshot: breach incidents, consent notices, PII scanner results, compliance score
*   Deep-link buttons to relevant modules

### 2.2 Dark Mode
Toggle available in chat header for comfortable extended use.

---

## 3. RAG (Retrieval-Augmented Generation)

### 3.1 How It Works
When a user asks a platform question:
1. User's message is embedded using Amazon Titan Text Embeddings V2.
2. Top-K similar chunks retrieved from `doc_embeddings` table (cosine similarity).
3. Retrieved documentation injected into system prompt as "PLATFORM DOCUMENTATION".
4. Bedrock model generates response grounded in documentation.

### 3.2 Documentation Index
*   Source: all Markdown files in `dpdpa_shield/docs/` folder
*   Excluded: `startup.md`, `docker.md`, `provider_setup_whitepaper.md` (ops-only)
*   Backend sections filtered out: API Design, Database Design, Backend Architecture, migrations, SQL
*   Indexed content: Module Overview, User Journeys, Screen Specifications, DPDPA Mapping, Playbooks, Troubleshooting

### 3.3 Re-indexing
Superadmins can trigger full re-index via `POST /api/ai/admin/reindex-docs`:
*   Reads all docs, chunks by `## ` headers (~1000 chars, 200 overlap)
*   SHA-256 change detection — only new/changed chunks re-embedded
*   Stale chunks for deleted files removed
*   Run after updating documentation to refresh Vajra AI's knowledge

### 3.4 What Vajra AI Will NOT Do
*   Mention backend APIs, database tables, SQL queries, or internal architecture
*   Invent legal provisions not in DPDPA
*   Provide definitive legal advice (always reminds to confirm with qualified counsel)

---

## 4. Workspace Context

When "Use company data" is enabled, Vajra AI receives live workspace snapshot:

| Context Item | Source |
| :--- | :--- |
| Compliance Score | Latest calculated score with section breakdown |
| Consent Notices | Count of published notices and draft status |
| PII Scanner Results | Active scan jobs and high-risk findings |
| Breach Incidents | Open incidents and their status |

Context is fetched via `GET /api/ai/context` and injected into the system prompt.

---

## 5. Specialized AI Features

Beyond the chat copilot, Vajra AI powers features across the platform:

| Feature | Module | What It Does |
| :--- | :--- | :--- |
| **Recommendation cards** | DPIA, RoPA, Breach | Purple AI suggestion cards with actionable bullets |
| **RoPA auto-discovery** | RoPA Module | Suggests processing activities from inventory context |
| **Policy drafting** | Policy Manager | Generates policy documents from RoPA data |
| **Consent notice drafting** | Consent Notices Manager | Drafts notice fields from uploaded documents or Q&A |
| **Compliance gap analysis** | DPDPA Map | AI-generated remediation recommendations |
| **Local document RAG** | Consent Notices Manager | Retrieves relevant chunks from uploaded policy documents |

---

## 6. Conversation Management

*   Conversations persisted per user per organization.
*   Messages stored with role (user/assistant) and timestamp.
*   Conversations can be renamed, deleted, and exported as text.
*   Streaming responses via Server-Sent Events (`text/event-stream`).

---

## 7. Configuration

Vajra AI requires AWS Bedrock configuration:

| Environment Variable | Description |
| :--- | :--- |
| `AWS_REGION` | Bedrock region (e.g., `ap-south-1`) |
| `AWS_ACCESS_KEY_ID` | AWS credentials (or use instance role) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `BEDROCK_MODEL_ID` | Chat model (e.g., `anthropic.claude-3-sonnet-20240229-v1:0`) |
| `BEDROCK_EMBED_MODEL_ID` | Embedding model (Titan V2) |
| `BEDROCK_MAX_TOKENS` | Max response tokens |
| `BEDROCK_TEMPERATURE` | Response creativity (0.0–1.0) |
| `RAG_TOP_K` | Number of documentation chunks to retrieve |

If not configured, Vajra AI shows a graceful degradation message: "Vajra AI is not configured on the server."

---

## 8. Security & Privacy

*   Conversations scoped to user + organization (no cross-tenant access).
*   Workspace context only includes aggregated counts and statuses — no raw PII.
*   AWS credentials never exposed to frontend.
*   Chat history stored in platform database with standard RBAC.
*   Vajra AI does not train on customer data — all inference via Bedrock API.

---

## 9. QA Verification Matrix

*   **TC-01**: Ask "How do I set up consent enforcement?" — response includes step-by-step from docs.
*   **TC-02**: Toggle "Use company data" — response references live compliance score.
*   **TC-03**: Unconfigured Bedrock — UI shows graceful degradation message.
*   **TC-04**: Re-index docs — new documentation reflected in responses.
*   **TC-05**: Cross-tenant conversation access returns 404.
