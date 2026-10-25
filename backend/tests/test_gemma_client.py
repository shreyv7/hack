"""Validate offline behavior and the SDK response boundary without paid API calls."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.core.config import Settings
from app.services.gemma_client import GemmaClient


@pytest.fixture
def client():
    return GemmaClient(Settings(_env_file=None, GEMINI_API_KEY=""))


def test_missing_key_returns_explicit_demo_outputs_for_all_six_functions(client):
    outputs = [client.digitize_paper_consent(b"\x89PNG\r\n\x1a\nexample"),
               client.explain_consent_notice("treatment", ["vitals"], "Hindi"),
               client.advise_clinician_access("p-101", "doc-1", "psychiatric records?", []),
               client.analyze_compliance_gaps([]), client.classify_ehr_sensitivity("routine checkup"),
               client.generate_consent_policy("Cardiology")]
    assert all(o["source"] == "fallback" for o in outputs)
    assert outputs[0]["has_signature"] is False
    assert outputs[0]["confidence_score"] == 0
    assert outputs[0]["detected_purposes"] == []
    assert outputs[2]["verdict"] == "ACCESS_DENIED"
    assert outputs[3]["compliance_score"] == 0
    assert outputs[4]["sensitivity_level"] == "highly_sensitive"


@pytest.mark.parametrize("language", ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali"])
def test_explainer_supports_eight_languages(client, language):
    result = client.explain_consent_notice("treatment", ["vitals"], language)
    assert result["explanation"]
    assert result["key_points"]
    assert result["language"] == language


@pytest.mark.parametrize("text", ['not-json', '{}', '{"sensitivity_level":"standard"}',
                                     '{"sensitivity_level":"invalid","categories":[],"pii_detected":[],"reason":"bad"}'])
def test_malformed_provider_output_falls_back_conservatively(text):
    sdk = SimpleNamespace(models=SimpleNamespace(generate_content=Mock(return_value=SimpleNamespace(text=text))))
    client = GemmaClient(Settings(_env_file=None, GEMINI_API_KEY="test-key"), client=sdk)
    result = client.classify_ehr_sensitivity("test")
    assert result["source"] == "fallback"
    assert result["sensitivity_level"] == "highly_sensitive"


def test_valid_json_and_fenced_json_are_parsed_and_model_config_is_used():
    sdk = SimpleNamespace(models=SimpleNamespace(generate_content=Mock(return_value=SimpleNamespace(text='```json\n{"sensitivity_level":"sensitive","categories":["medications"],"pii_detected":[],"reason":"Prescription"}\n```'))))
    client = GemmaClient(Settings(_env_file=None, GEMINI_API_KEY="test-key", GEMMA_MODEL_ID="custom-model"), client=sdk)
    result = client.classify_ehr_sensitivity("prescription")
    assert result["source"] == "gemma"
    assert result["sensitivity_level"] == "sensitive"
    assert sdk.models.generate_content.call_args.kwargs["model"] == "custom-model"


def test_provider_failure_returns_fallback_without_exception_details():
    sdk = SimpleNamespace(models=SimpleNamespace(generate_content=Mock(side_effect=RuntimeError("secret-key-value"))))
    result = GemmaClient(Settings(_env_file=None, GEMINI_API_KEY="test-key"), client=sdk).generate_consent_policy("Dental")
    assert result["source"] == "fallback"
    assert "secret-key-value" not in str(result)
