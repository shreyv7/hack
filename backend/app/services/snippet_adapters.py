from abc import ABC, abstractmethod
from typing import Dict, Type
from app.models.integration_property import IntegrationProperty


class SnippetAdapter(ABC):
    @abstractmethod
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        pass


class HTMLAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        banner_attr = f'\n  data-banner-id="{banner_id}"' if banner_id else ""
        sri_attr = f'\n  integrity="{sri_hash}"\n  crossorigin="anonymous"' if sri_hash else ""
        return (
            f'<script async src="{cmp_script_url}"\n'
            f'  data-property-id="{property_obj.id}"\n'
            f'  data-api-key="{api_key_prefix}"{banner_attr}\n'
            f'  data-api-url="{api_base_url}"\n'
            f'  data-language="{language}"\n'
            f'  data-blocker-mode="{blocker_mode}"{sri_attr}>\n'
            f'</script>'
        )


class ReactAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        return (
            "// Install NPM package\n"
            "npm install @zeroshield/react\n\n"
            "// In your application root file (e.g. index.js / App.js):\n"
            "import React from 'react';\n"
            "import { ZeroShieldProvider } from '@zeroshield/react';\n"
            "import MainLayout from './MainLayout';\n\n"
            "function App() {\n"
            "  return (\n"
            "    <ZeroShieldProvider\n"
            f"      propertyId=\"{property_obj.id}\"\n"
            f"      apiKey=\"{api_key_prefix}\"\n"
            "      options={{\n"
            f"        blockerMode: \"{blocker_mode}\",\n"
            f"        language: \"{language}\",\n"
            f"        bannerId: {f"'{banner_id}'" if banner_id else 'undefined'}\n"
            "      }}\n"
            "    >\n"
            "      <MainLayout />\n"
            "    </ZeroShieldProvider>\n"
            "  );\n"
            "}"
        )


class NextjsAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        banner_attr = f'\n          data-banner-id="{banner_id}"' if banner_id else ""
        return (
            "// pages/_document.js or app/layout.tsx\n"
            "import Script from 'next/script';\n\n"
            "export default function RootLayout({ children }) {\n"
            "  return (\n"
            "    <html lang=\"en\">\n"
            "      <head>\n"
            "        {/* Load ZeroShield compliance script */}\n"
            "        <Script\n"
            f"          src=\"{cmp_script_url}\"\n"
            "          strategy=\"afterInteractive\"\n"
            f"          data-property-id=\"{property_obj.id}\"\n"
            f"          data-api-key=\"{api_key_prefix}\"\n"
            f"          data-api-url=\"{api_base_url}\"\n"
            f"          data-language=\"{language}\"\n"
            f"          data-blocker-mode=\"{blocker_mode}\"{banner_attr}\n"
            "        />\n"
            "      </head>\n"
            "      <body>{children}</body>\n"
            "    </html>\n"
            "  );\n"
            "}"
        )


class AngularAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        banner_line = f"\n  s.setAttribute('data-banner-id', '{banner_id}');" if banner_id else ""
        return (
            "// 1. Create a script file: src/assets/zeroshield.js\n"
            "(function() {\n"
            "  var s = document.createElement('script');\n"
            "  s.async = true;\n"
            f"  s.src = \"{cmp_script_url}\";\n"
            f"  s.setAttribute('data-property-id', '{property_obj.id}');\n"
            f"  s.setAttribute('data-api-key', '{api_key_prefix}');\n"
            f"  s.setAttribute('data-api-url', '{api_base_url}');\n"
            f"  s.setAttribute('data-blocker-mode', '{blocker_mode}');\n"
            f"  s.setAttribute('data-language', '{language}');{banner_line}\n"
            "  document.head.appendChild(s);\n"
            "})();\n\n"
            "// 2. Add to angular.json scripts:\n"
            "// \"scripts\": [ \"src/assets/zeroshield.js\" ]"
        )


class VueAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        banner_field = f"\n    bannerId: '{banner_id}'," if banner_id else ""
        return (
            "// main.js\n"
            "import { createApp } from 'vue';\n"
            "import App from './App.vue';\n"
            "import ZeroShieldPlugin from '@zeroshield/vue';\n\n"
            "const app = createApp(App);\n\n"
            "app.use(ZeroShieldPlugin, {\n"
            f"  propertyId: '{property_obj.id}',\n"
            f"  apiKey: '{api_key_prefix}',\n"
            "  options: {\n"
            f"    blockerMode: '{blocker_mode}',\n"
            f"    language: '{language}',\n"
            f"    apiUrl: '{api_base_url}',{banner_field}\n"
            "  }\n"
            "});\n\n"
            "app.mount('#app');"
        )


class WordPressAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        blocker_mode = getattr(property_obj.blocker_mode, "value", property_obj.blocker_mode)
        language = "auto" if property_obj.auto_language else property_obj.default_language
        banner_attr = f'\n  data-banner-id="{banner_id}"' if banner_id else ""
        return (
            "<!-- Place this code in your active theme's header.php file inside the <head> tag -->\n"
            "<?php\n"
            "  // ZeroShield WordPress Head Injection\n"
            "?>\n"
            f"<script async src=\"{cmp_script_url}\"\n"
            f"  data-property-id=\"{property_obj.id}\"\n"
            f"  data-api-key=\"{api_key_prefix}\"\n"
            f"  data-api-url=\"{api_base_url}\"\n"
            f"  data-language=\"{language}\"\n"
            f"  data-blocker-mode=\"{blocker_mode}\"{banner_attr}>\n"
            "</script>"
        )


class GTMAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        return (
            "<!-- Google Tag Manager Integration -->\n"
            "<!-- 1. Download custom GTM Template from link: -->\n"
            f"<!-- {gtm_template_url} -->\n\n"
            "<!-- 2. Import into GTM -> Templates -> Tag Templates. -->\n"
            "<!-- 3. Create a Tag, select ZeroShield Consent Banner, and specify: -->\n"
            f"Property ID: \"{property_obj.id}\"\n"
            f"API Key: \"{api_key_prefix}\""
        )


class ManualAdapter(SnippetAdapter):
    def generate(self, property_obj: IntegrationProperty, api_key_prefix: str, cmp_script_url: str, api_base_url: str, gtm_template_url: str, banner_id: str | None = None, sri_hash: str | None = None) -> str:
        return (
            "// Check client purposes dynamically using ZeroShield JS SDK\n"
            "if (window.ZeroShield && window.ZeroShield.hasConsent('analytics')) {\n"
            "  // Safe to load Google Analytics, Facebook Pixel, etc.\n"
            "}\n\n"
            "// Register dynamic event listener for real-time consent updates\n"
            "window.addEventListener('zeroshield_consent_changed', function(event) {\n"
            "  const purposes = event.detail.purposes; // object: { analytics: true, marketing: false, necessary: true }\n"
            "  \n"
            "  if (purposes.marketing) {\n"
            "    // Fire tracking tags\n"
            "  }\n"
            "});"
        )


class SnippetRegistry:
    def __init__(self):
        self._adapters: Dict[str, Type[SnippetAdapter]] = {}
        # Register default adapters
        self.register("html", HTMLAdapter)
        self.register("react", ReactAdapter)
        self.register("nextjs", NextjsAdapter)
        self.register("angular", AngularAdapter)
        self.register("vue", VueAdapter)
        self.register("wordpress", WordPressAdapter)
        self.register("gtm", GTMAdapter)
        self.register("manual", ManualAdapter)

    def register(self, key: str, adapter_cls: Type[SnippetAdapter]) -> None:
        self._adapters[key] = adapter_cls

    def get_adapter(self, key: str) -> SnippetAdapter:
        adapter_cls = self._adapters.get(key)
        if not adapter_cls:
            raise ValueError(f"Snippet adapter '{key}' is not registered.")
        return adapter_cls()


snippet_registry = SnippetRegistry()
