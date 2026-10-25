"""Tests for Req 9 — regulatory reports, crosswalk, governance metrics adapters."""

import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from app.services.governance_metrics_service import GovernanceMetricsService
from app.services.regulatory_report_service import CATALOG, RegulatoryReportService


class FrameworkCrosswalkJsonTests(unittest.TestCase):
    def test_crosswalk_json_valid(self) -> None:
        path = Path(__file__).resolve().parents[1] / "app" / "data" / "framework_crosswalk.json"
        self.assertTrue(path.exists())
        data = json.loads(path.read_text())
        self.assertEqual(data.get("primary_framework"), "dpdpa")
        self.assertIn("rbi", data.get("frameworks", {}))
        self.assertIn("iso27001", data.get("frameworks", {}))
        self.assertIn("nist", data.get("frameworks", {}))
        for section_key, mapping in data.get("mappings", {}).items():
            self.assertIn("-", section_key)
            self.assertIn("dpdpa_section", mapping)
            for fw in ("rbi", "iso27001", "nist"):
                self.assertIn(fw, mapping)
                self.assertIsInstance(mapping[fw], list)


class RegulatoryReportCatalogTests(unittest.TestCase):
    def test_catalog_includes_fino_pack(self) -> None:
        keys = {item.key for item in CATALOG}
        self.assertIn("fino_regulatory_pack", keys)
        self.assertIn("ropa_register", keys)
        self.assertIn("consent_proof", keys)

    def test_fino_pack_zip_only(self) -> None:
        pack = next(c for c in CATALOG if c.key == "fino_regulatory_pack")
        self.assertEqual(pack.formats, ["zip"])


class MetricsFilterPropagationTests(unittest.TestCase):
    def test_time_cutoff_mapping(self) -> None:
        cutoff = GovernanceMetricsService._time_cutoff("90d")
        self.assertIsNotNone(cutoff)
        self.assertIsNone(GovernanceMetricsService._time_cutoff("unknown"))

    def test_months_from_range(self) -> None:
        self.assertEqual(GovernanceMetricsService._months_from_range("7d"), 1)
        self.assertEqual(GovernanceMetricsService._months_from_range("90d"), 6)


class ReportFiltersSchemaTests(unittest.TestCase):
    def test_report_filters_defaults(self) -> None:
        from app.schemas.regulatory_report import ReportFilters

        f = ReportFilters()
        self.assertEqual(f.time_range, "90d")
        self.assertIsNone(f.channel)

    def test_metrics_query_extended_filters(self) -> None:
        from app.schemas.governance_dashboard import MetricsQuery
        from app.models.governance_dashboard import WidgetDataSource

        pid = uuid4()
        q = MetricsQuery(
            data_source=WidgetDataSource.consent,
            property_id=pid,
            channel="mobile_banking",
            journey_key="kyc_onboarding",
        )
        self.assertEqual(q.property_id, pid)
        self.assertEqual(q.channel, "mobile_banking")


class WidgetDataSourceEnumTests(unittest.TestCase):
    def test_retention_and_data_sources_enum(self) -> None:
        from app.models.governance_dashboard import WidgetDataSource

        self.assertEqual(WidgetDataSource.retention.value, "retention")
        self.assertEqual(WidgetDataSource.data_sources.value, "data_sources")


class RegulatoryReportRenderTests(unittest.TestCase):
    def test_render_json(self) -> None:
        service = RegulatoryReportService(db=SimpleNamespace())  # type: ignore[arg-type]
        content, ctype, ext = service._render("json", "test", {"cover": {"org_name": "Test"}}, SimpleNamespace(), uuid4())  # type: ignore[arg-type]
        self.assertEqual(ext, "json")
        self.assertEqual(ctype, "application/json")
        parsed = json.loads(content.decode())
        self.assertIn("cover", parsed)


if __name__ == "__main__":
    unittest.main()
