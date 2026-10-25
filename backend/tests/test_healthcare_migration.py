"""Check migration SQL and reversible schema installation without a live DB."""
import importlib
import io

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect


def test_postgresql_migration_generates_all_five_tables():
    output = io.StringIO()
    config = Config("alembic.ini", output_buffer=output)
    command.upgrade(config, "20260731_merge_email_campaign:20261025_healthcare", sql=True)
    sql = output.getvalue()
    for name in ("healthcare_patients", "ehr_clinical_records", "healthcare_consents", "access_decision_audits", "emergency_override_logs"):
        assert f"CREATE TABLE {name}" in sql
    assert "clinical_data JSONB" in sql
    assert "FOREIGN KEY(proof_record_id) REFERENCES proof_vault_records" in sql


def test_migration_can_upgrade_and_downgrade_empty_schema(monkeypatch):
    from pathlib import Path
    import importlib.util
    # SQLite type compilation is supplied by test_healthcare; repeat it here so
    # this migration test also works when run in isolation.
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.ext.compiler import compiles
    @compiles(JSONB, "sqlite")
    def jsonb(_type, _compiler, **_kw):
        return "JSON"
    path = Path("alembic/versions/20261025_healthcare.py")
    spec = importlib.util.spec_from_file_location("healthcare_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(conn)))
        migration.upgrade()
        assert len(inspect(conn).get_table_names()) == 5
        migration.downgrade()
        assert inspect(conn).get_table_names() == []
    engine.dispose()
