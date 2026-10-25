"""
Application configuration.

All settings are read from environment variables (and the local .env file).
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Self


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    PROJECT_NAME: str = "DPDPA Shield API"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api"

    # --- Redis (decision cache, background jobs) ---
    REDIS_URL: str = ""  # e.g. redis://localhost:6379/0 — empty disables Redis

    # --- Consent enforcement ---
    DECISION_CACHE_TTL_SECONDS: int = 30
    DECISION_TOKEN_TTL_SECONDS: int = 900

    # --- Database ---
    DATABASE_URL: str = "postgresql+psycopg2://dpdpa:dpdpa@localhost:5432/dpdpa_shield"

    # --- Security ---
    SECRET_KEY: str = "CHANGE_ME"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Fernet key for encrypting stored secrets (data-source passwords). If empty,
    # a key is derived from SECRET_KEY. Generate one with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    DATA_SOURCE_ENCRYPTION_KEY: str = ""

    # --- Public base URL of THIS backend ---
    # Used to build links sent to external people (e.g. the parental-consent
    # link emailed to a parent). Must be reachable from their browser.
    BACKEND_PUBLIC_URL: str = "http://localhost:8000"

    # --- File uploads (Data Sources) ---
    # Directory where uploaded data-source files are stored, relative to the
    # backend working directory unless absolute.
    UPLOAD_DIR: str = "uploads/data_sources"
    # Generated CISO board-report PDFs (relative to backend root unless absolute).
    CISO_REPORT_DIR: str = "templates"
    # Maximum accepted upload size in bytes (default 50 MB).
    MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024

    # --- CORS ---
    # Only applies to dashboard (/api/v1/*) routes — i.e. your own frontend URL(s).
    # Client/customer domains do NOT need to be added here. The SplitCORSMiddleware
    # in main.py automatically allows all origins on /public/v1/* routes (cmp.js SDK
    # endpoints), where the real gate is the API key + per-property origin allowlist.
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    )


    # --- Superadmin seed ---
    SUPERADMIN_EMAIL: str = "superadmin@zeroshield.in"
    SUPERADMIN_PASSWORD: str = "ChangeMe123!"

    # --- SMTP (invite emails) ---
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "DPDPA Shield"

    # Link in invite emails (Vite dev server or production app URL)
    FRONTEND_URL: str = "http://localhost:5173"

    # --- CMP deployment URLs (used in install snippets) ---
    # Defaults derive from FRONTEND_URL (cmp.js) and BACKEND_PUBLIC_URL (public API).
    CMP_SCRIPT_URL: str = ""
    CMP_PUBLIC_API_URL: str = ""
    CMP_GTM_TEMPLATE_URL: str = ""

    # --- Shield AI provider switch ---
    # vertex = Gemini on Vertex AI via Application Default Credentials (ADC).
    # bedrock = existing AWS Bedrock Converse path. Flip this one value to switch.
    AI_PROVIDER: str = "vertex"

    # --- Shield AI (Google Cloud Vertex AI) ---
    # ADC supplies credentials: local `gcloud auth application-default login`,
    # Cloud Run uses the runtime service account. No API key is required.
    GOOGLE_CLOUD_PROJECT: str = ""
    GOOGLE_CLOUD_LOCATION: str = "asia-south1"
    VERTEX_MODEL_ID: str = "gemini-2.5-flash"
    VERTEX_VISION_MODEL_ID: str = ""  # empty = reuse VERTEX_MODEL_ID
    VERTEX_EMBED_MODEL_ID: str = "gemini-embedding-001"
    # Must match the existing doc_embeddings.vector(1024) column.
    VERTEX_EMBED_DIMENSIONS: int = 1024
    VERTEX_MAX_TOKENS: int = 4096
    VERTEX_TEMPERATURE: float = 0.3
    VERTEX_VISION_MAX_TOKENS: int = 500
    # Gemini 2.5 Flash thinking budget. 0 = off (faster, more reliable JSON).
    VERTEX_THINKING_BUDGET: int = 0

    # --- Shield AI (AWS Bedrock, kept for AI_PROVIDER=bedrock) ---
    # The model is NEVER hardcoded — set BEDROCK_MODEL_ID in .env to any model
    # ID (or inference profile ARN) enabled in your AWS account, e.g.
    #   anthropic.claude-3-5-sonnet-20241022-v2:0
    #   us.anthropic.claude-sonnet-4-5-20250929-v1:0
    #   meta.llama3-1-70b-instruct-v1:0
    #   mistral.mistral-large-2407-v1:0
    # All providers are reached through Bedrock's unified Converse API, so any
    # text/chat model works without code changes.
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""  # optional, for temporary STS credentials
    BEDROCK_MODEL_ID: str = ""
    # Reasoning models (gpt-oss, DeepSeek R1, extended-thinking Claude) spend a
    # large share of the budget "thinking" before the answer, so keep this
    # generous — too low yields truncated or empty replies. Raise it in .env for
    # long-form output.
    BEDROCK_MAX_TOKENS: int = 4096
    BEDROCK_TEMPERATURE: float = 0.3
    # Vision assistant — Amazon Nova Lite (native multimodal). Set empty to reuse BEDROCK_MODEL_ID.
    BEDROCK_VISION_MODEL_ID: str = "amazon.nova-lite-v1:0"
    BEDROCK_VISION_MAX_TOKENS: int = 500

    # --- Shield AI RAG (documentation retrieval) ---
    # Empty = repo-relative docs/ (local uvicorn). Docker/Cloud Run should set
    # this to the mounted/copied docs directory inside the container.
    SHIELD_AI_DOCS_DIR: str = ""
    BEDROCK_EMBED_MODEL_ID: str = "amazon.titan-embed-text-v2:0"
    RAG_CHUNK_SIZE: int = 1000          # characters per chunk
    RAG_CHUNK_OVERLAP: int = 200        # overlap between adjacent chunks
    RAG_TOP_K: int = 5                  # number of chunks to retrieve per query
    RAG_AUTO_INDEX_ON_STARTUP: bool = True  # auto-detect doc changes on boot

    @model_validator(mode="after")
    def validate_production_secrets(self) -> Self:
        if self.ENVIRONMENT in ("production", "staging"):
            insecure_secrets = ("CHANGE_ME", "changeme", "")
            if self.SECRET_KEY in insecure_secrets:
                raise ValueError("SECRET_KEY must be set to a strong value in production/staging")
            if self.SUPERADMIN_PASSWORD in ("ChangeMe123!", "changeme", ""):
                raise ValueError("SUPERADMIN_PASSWORD must be changed in production/staging")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def ai_provider(self) -> str:
        """Active Shield AI backend: ``vertex`` or ``bedrock``."""
        value = (self.AI_PROVIDER or "vertex").strip().lower()
        return value if value in {"vertex", "bedrock"} else "vertex"

    @property
    def vertex_configured(self) -> bool:
        """True when Vertex AI project + chat model are set (ADC supplies creds)."""
        return bool(self.GOOGLE_CLOUD_PROJECT.strip() and self.VERTEX_MODEL_ID.strip())

    @property
    def bedrock_configured(self) -> bool:
        """True when a Bedrock chat model ID is set.

        Credentials may also come from the default AWS chain (instance role,
        ~/.aws/credentials, env vars), so explicit keys are optional.
        """
        return bool(self.BEDROCK_MODEL_ID)

    @property
    def ai_configured(self) -> bool:
        """True when the active provider can serve Shield AI requests."""
        if self.ai_provider == "vertex":
            return self.vertex_configured
        return self.bedrock_configured

    @property
    def ai_model_id(self) -> str:
        if self.ai_provider == "vertex":
            return self.VERTEX_MODEL_ID.strip()
        return self.BEDROCK_MODEL_ID.strip()

    @property
    def ai_region(self) -> str:
        if self.ai_provider == "vertex":
            return self.GOOGLE_CLOUD_LOCATION.strip() or "global"
        return self.AWS_REGION

    @property
    def ai_max_tokens(self) -> int:
        if self.ai_provider == "vertex":
            return self.VERTEX_MAX_TOKENS
        return self.BEDROCK_MAX_TOKENS

    @property
    def ai_temperature(self) -> float:
        if self.ai_provider == "vertex":
            return self.VERTEX_TEMPERATURE
        return self.BEDROCK_TEMPERATURE

    @property
    def resolved_vertex_vision_model_id(self) -> str:
        return (self.VERTEX_VISION_MODEL_ID or self.VERTEX_MODEL_ID).strip()

    @property
    def resolved_embed_model_id(self) -> str:
        if self.ai_provider == "vertex":
            return self.VERTEX_EMBED_MODEL_ID.strip()
        return self.BEDROCK_EMBED_MODEL_ID.strip()

    @property
    def resolved_embed_dimensions(self) -> int:
        if self.ai_provider == "vertex":
            return self.VERTEX_EMBED_DIMENSIONS
        return 1024

    @property
    def bedrock_vision_configured(self) -> bool:
        """True when Shield AI Bedrock is configured for vision (dedicated or shared model)."""
        return bool(self.BEDROCK_VISION_MODEL_ID.strip() or self.bedrock_configured)

    @property
    def ai_vision_configured(self) -> bool:
        if self.ai_provider == "vertex":
            return bool(self.resolved_vertex_vision_model_id and self.GOOGLE_CLOUD_PROJECT.strip())
        return self.bedrock_vision_configured

    @property
    def resolved_vision_model_ids(self) -> list[str]:
        """Vision model IDs to try, in order (explicit vision model, then chat model)."""
        candidates: list[str] = []
        for raw in (self.BEDROCK_VISION_MODEL_ID, self.BEDROCK_MODEL_ID):
            model_id = raw.strip()
            if model_id and model_id not in candidates:
                candidates.append(model_id)
        # Cross-region inference profiles for Nova when the base ID is unavailable.
        for model_id in list(candidates):
            if model_id.startswith("amazon.nova") and not model_id.startswith(
                ("us.", "eu.", "apac.")
            ):
                for prefix in ("us.", "eu.", "apac."):
                    prefixed = f"{prefix}{model_id}"
                    if prefixed not in candidates:
                        candidates.append(prefixed)
        return candidates

    @property
    def smtp_login_password(self) -> str:
        """Gmail App Passwords are often copied with spaces; SMTP login needs them stripped."""
        return (self.SMTP_PASSWORD or "").replace(" ", "")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.smtp_login_password)

    @property
    def smtp_ready(self) -> bool:
        """True when SMTP is set with real credentials (not .env placeholders)."""
        if not self.smtp_configured:
            return False
        placeholder_markers = (
            "youraccount",
            "your-gmail",
            "your-16-char",
            "example.com",
            "changeme",
        )
        user_lower = self.SMTP_USER.lower()
        pass_lower = self.smtp_login_password.lower()
        return not any(m in user_lower or m in pass_lower for m in placeholder_markers)

    def validate_smtp_for_startup(self) -> None:
        """Raise if SMTP is required but incomplete (used when sending email)."""
        missing = [
            name
            for name, value in [
                ("SMTP_HOST", self.SMTP_HOST),
                ("SMTP_USER", self.SMTP_USER),
                ("SMTP_PASSWORD", self.smtp_login_password),
            ]
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"Missing required SMTP settings: {', '.join(missing)}. "
                "See .env.example for Gmail App Password setup."
            )


settings = Settings()
