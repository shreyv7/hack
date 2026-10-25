# vajra-python

Reference library for **local verification** of Vajra bundle decision tokens and FastAPI route enforcement.

## Install

```bash
pip install -e "dpdpa_shield/packages/vajra-python[fastapi]"
```

## Environment

```bash
export VAJRA_PROPERTY_ID="<property-uuid>"
export VAJRA_DECISION_SECRET="<signing-secret-from-admin-api>"
export VAJRA_API_URL="https://api.example.com/public/v1"
export VAJRA_API_KEY="<optional-api-key-for-decision-api-fallback>"
```

## FastAPI middleware

```python
from fastapi import FastAPI, Request
from vajra import require_consent

app = FastAPI()

@app.post("/newsletter/subscribe")
@require_consent("marketing_newsletter")
async def subscribe(request: Request, payload: dict):
    return {"status": "ok"}
```

The decorator:
1. Verifies `X-ZS-Decision-Token` locally (no network)
2. Falls back to `POST /consent/decision` when the token is missing/expired
3. Blocks only when `effective_mode == enforced` and consent is denied

Deny behaviors: `reject` (403, default), `strip_fields`, `queue_pending` (202).

## Browser SDK

```html
<form data-zs-collect-purpose="marketing_newsletter">
  ...
</form>
<script>
  // Or imperatively:
  form.addEventListener('submit', async (e) => {
    if (!await Vajra.guardSubmit(form, 'marketing_newsletter')) e.preventDefault();
  });
  const token = await Vajra.getDecisionToken();
</script>
```

Attach `X-ZS-Decision-Token: <token>` on server-side API calls from the customer's backend.
