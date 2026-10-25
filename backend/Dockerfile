# ============================================================
# DPDPA Shield — Backend image  (FOR LATER — not needed for local dev)
# Build:  docker build -t dpdpa-backend .
# This is here so dockerizing later is a no-op. Ignore it while
# you are running everything locally with uvicorn.
# ============================================================
FROM python:3.12-slim

# Keep Python lean and logs unbuffered.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for psycopg2 / building wheels.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# spaCy model for Presidio free-text NER (Masking / Anonymisation names & places).
RUN python -m spacy download en_core_web_sm
RUN playwright install --with-deps chromium

# Copy application code.
COPY . .

EXPOSE 8000

# Run migrations then start the API.
CMD ["sh", "-c", "alembic upgrade heads && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
