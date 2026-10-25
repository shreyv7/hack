import json
from pathlib import Path
from app.core.config import settings
from app.models.integration_property import IntegrationProperty
from app.schemas.integration_snippet import SnippetOutput


class SnippetService:
    @property
    def cmp_script_url(self) -> str:
        if settings.CMP_SCRIPT_URL:
            return settings.CMP_SCRIPT_URL.rstrip("/")
        return f"{settings.FRONTEND_URL.rstrip('/')}/cmp.js"

    @property
    def api_base_url(self) -> str:
        if settings.CMP_PUBLIC_API_URL:
            return settings.CMP_PUBLIC_API_URL.rstrip("/")
        return f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/public/v1"

    @property
    def gtm_template_url(self) -> str:
        if settings.CMP_GTM_TEMPLATE_URL:
            return settings.CMP_GTM_TEMPLATE_URL.rstrip("/")
        return f"{self.api_base_url}/integrations/gtm/template.tpl"

    @property
    def sri_hash(self) -> str | None:
        manifest_path = Path(__file__).resolve().parents[3] / "frontend" / "public" / "cmp.manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("sri_hash")
            except Exception:
                pass
        return None

    def generate_snippet(self, property_obj: IntegrationProperty, api_key_prefix: str, banner_id: str | None = None) -> SnippetOutput:
        from app.services.snippet_adapters import snippet_registry

        html_snippet = snippet_registry.get_adapter("html").generate(
            property_obj, api_key_prefix, self.cmp_script_url, self.api_base_url, self.gtm_template_url, banner_id, self.sri_hash
        )
        npm_snippet = snippet_registry.get_adapter("react").generate(
            property_obj, api_key_prefix, self.cmp_script_url, self.api_base_url, self.gtm_template_url, banner_id, self.sri_hash
        )

        return SnippetOutput(
            html=html_snippet,
            npm_install=npm_snippet,
            gtm_template_url=self.gtm_template_url
        )
