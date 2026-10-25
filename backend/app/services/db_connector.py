"""
Shared low-level connector to a customer's external data source.

Used by Data Sources (test), Data Inventory (schema scan), the PII Scanner
(sampling), Retention (count/delete) and Children's Data (minor query).

Supported source types:
  * PostgreSQL, MySQL — SQL backend (SQLAlchemy, dialect-aware quoting).
  * MongoDB — document backend (pymongo).
Other types are recorded as metadata only.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, Engine

from app.core.crypto import decrypt_secret
from app.models.data_source import DataSource

# Identifier validation — values come from our own inventory (admin-controlled)
# but we still refuse anything that isn't a plain identifier before using it.
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_SECONDS = 5

# Connector slugs / engines we can introspect via a SQLAlchemy engine or pymongo.
SUPPORTED_TYPES = {"postgresql", "mysql", "mongodb"}

# Resolved engines we know how to talk to.
SQL_ENGINES = {"postgresql", "mysql", "mariadb", "oracle", "sqlserver", "sqlite"}
ALL_ENGINES = SQL_ENGINES | {"mongodb"}
# Subset read_schema() can introspect today (postgres/mysql/mariadb dialect + mongo).
SCHEMA_IMPORT_ENGINES = {"postgresql", "mysql", "mariadb", "mongodb"}

# Schemas/databases we never want to introspect.
_SYSTEM_SCHEMAS = {
    "information_schema", "pg_catalog", "pg_toast",          # postgres
    "mysql", "performance_schema", "sys",                    # mysql
    "sys", "guest", "db_owner", "db_accessadmin",            # sqlserver-ish
    "system", "sysaux", "outln", "xdb", "ctxsys", "mdsys",   # oracle
    "audsys", "dbsnmp", "gsmadmin_internal", "ordsys",       # oracle
}


@dataclass
class TableSchema:
    schema: str
    table: str
    columns: list[tuple[str, str]] = field(default_factory=list)  # (name, type_str)


@dataclass
class TableDependencies:
    """Referential context for a table, used to warn before a retention delete."""
    has_primary_key: bool
    primary_key_columns: list[str]
    referencing_tables: list[str]   # tables whose FK points AT this table (children)
    referenced_tables: list[str]    # tables this table points TO (parents)
    supported: bool                 # False when the engine has no FK concept (Mongo)
    note: str | None = None


def resolve_engine(source: DataSource) -> str | None:
    """Map a source (connector slug + category + extra_config.engine) to a concrete
    database engine we can connect to, or None if it isn't a database source / the
    engine hasn't been specified.

    Cloud connectors (aws_rds, gcp_sql, self_hosted, other_cloud, other_db) carry
    the underlying engine in extra_config['engine']; the rest are fixed.
    """
    st = source.source_type
    if st in ALL_ENGINES:  # direct database connector
        return st
    fixed = {
        "azure_sql": "sqlserver",
        "mongodb_atlas": "mongodb",
        # legacy generic slug
        "api": None,
    }
    if st in fixed:
        return fixed[st]
    if st in {"aws_rds", "gcp_sql", "self_hosted", "other_cloud", "other_db"}:
        engine = (source.extra_config or {}).get("engine")
        return engine if engine in ALL_ENGINES else None
    return None


def supports_introspection(source: DataSource) -> bool:
    eng = resolve_engine(source)
    return eng in ALL_ENGINES


def supports_schema_import(source: DataSource) -> bool:
    """True when import_schema_from_source can introspect this source."""
    eng = resolve_engine(source)
    return eng in SCHEMA_IMPORT_ENGINES


def _is_mongo(source: DataSource) -> bool:
    return resolve_engine(source) == "mongodb"


def _is_atlas(source: DataSource) -> bool:
    return source.source_type == "mongodb_atlas" or bool((source.extra_config or {}).get("srv"))


# ============================ SQL backend ============================

# engine -> (sqlalchemy dialect+driver, default port)
_SQL_DRIVERS = {
    "postgresql": ("postgresql+psycopg2", 5432),
    "mysql": ("mysql+pymysql", 3306),
    "mariadb": ("mysql+pymysql", 3306),
    "oracle": ("oracle+oracledb", 1521),
    "sqlserver": ("mssql+pymssql", 1433),
}


def build_engine(source: DataSource) -> Engine:
    """Build a SQLAlchemy engine for a SQL source. Raises ValueError otherwise."""
    engine = resolve_engine(source)
    if engine is None:
        raise ValueError(
            "No database engine resolved for this source — choose an engine "
            "(extra_config.engine) for cloud/other sources."
        )
    if engine == "mongodb":
        raise ValueError("MongoDB uses the document backend, not a SQL engine.")

    # SQLite is file-based: the path lives in database_name (or host).
    if engine == "sqlite":
        path = source.database_name or source.host
        if not path:
            raise ValueError("SQLite requires a file path (database name).")
        return create_engine(f"sqlite:///{path}", pool_pre_ping=False)

    driver = _SQL_DRIVERS.get(engine)
    if driver is None:
        raise ValueError(f"Connection for engine '{engine}' is not supported here.")
    if not (source.host and source.username):
        raise ValueError("Host and username are required.")
    if engine not in {"oracle"} and not source.database_name:
        raise ValueError("Database name is required.")
    dialect, default_port = driver
    password = decrypt_secret(source.password) if source.password else ""

    query: dict = {}
    if engine == "oracle":
        # Oracle thin mode: connect by service name (most common for RDS/Cloud SQL).
        query["service_name"] = source.database_name or "ORCL"
        url = URL.create(
            dialect, username=source.username, password=password,
            host=source.host, port=source.port or default_port, query=query,
        )
    else:
        url = URL.create(
            dialect, username=source.username, password=password,
            host=source.host, port=source.port or default_port,
            database=source.database_name,
        )

    connect_args: dict = {}
    if engine == "postgresql":
        connect_args["connect_timeout"] = CONNECT_TIMEOUT_SECONDS
        if source.ssl_enabled:
            connect_args["sslmode"] = "require"
    elif engine in {"mysql", "mariadb"}:
        connect_args["connect_timeout"] = CONNECT_TIMEOUT_SECONDS
        if source.ssl_enabled:
            connect_args["ssl"] = {"ssl": True}
    elif engine == "sqlserver":
        connect_args["timeout"] = CONNECT_TIMEOUT_SECONDS
    elif engine == "oracle":
        # oracledb thin uses tcp_connect_timeout
        connect_args["tcp_connect_timeout"] = CONNECT_TIMEOUT_SECONDS

    return create_engine(url, connect_args=connect_args, pool_pre_ping=False)


def _limited_select(engine: Engine, columns: str, from_where: str, n: int) -> str:
    """Build a dialect-correct row-limited SELECT.

    Postgres/MySQL/MariaDB/SQLite use LIMIT; SQL Server uses TOP; Oracle uses
    FETCH FIRST … ROWS ONLY. `from_where` is everything after FROM.
    """
    n = int(n)
    name = engine.dialect.name
    if name == "mssql":
        return f"SELECT TOP {n} {columns} FROM {from_where}"
    if name == "oracle":
        return f"SELECT {columns} FROM {from_where} FETCH FIRST {n} ROWS ONLY"
    return f"SELECT {columns} FROM {from_where} LIMIT {n}"


def _sql_quote(engine: Engine, name: str) -> str:
    """Dialect-aware quoting of a possibly schema-qualified identifier."""
    parts = name.split(".")
    if not parts or not all(_IDENT_RE.match(p) for p in parts):
        raise ValueError(f"Unsafe table identifier: {name!r}")
    preparer = engine.dialect.identifier_preparer
    return ".".join(preparer.quote(p) for p in parts)


# ============================ Mongo backend ============================

def _mongo_db(source: DataSource):
    import pymongo

    if not (source.host and source.database_name):
        raise ValueError("Host and database name are required.")
    password = decrypt_secret(source.password) if source.password else None

    if _is_atlas(source):
        # Atlas / SRV: mongodb+srv://user:pass@cluster-host/  (no explicit port)
        from urllib.parse import quote_plus

        userinfo = ""
        if source.username:
            userinfo = f"{quote_plus(source.username)}:{quote_plus(password or '')}@"
        uri = f"mongodb+srv://{userinfo}{source.host}/"
        client = pymongo.MongoClient(
            uri,
            serverSelectionTimeoutMS=CONNECT_TIMEOUT_SECONDS * 1000,
            connectTimeoutMS=CONNECT_TIMEOUT_SECONDS * 1000,
        )
        return client, client[source.database_name]

    kwargs: dict = {
        "host": source.host,
        "port": source.port or 27017,
        "serverSelectionTimeoutMS": CONNECT_TIMEOUT_SECONDS * 1000,
        "connectTimeoutMS": CONNECT_TIMEOUT_SECONDS * 1000,
    }
    if source.username:
        kwargs["username"] = source.username
        kwargs["password"] = password
    client = pymongo.MongoClient(**kwargs)
    return client, client[source.database_name]


def _mongo_cutoff(cutoff: object) -> object:
    """Mongo dates are BSON datetimes; convert a date to datetime for comparison."""
    if isinstance(cutoff, datetime):
        return cutoff
    if isinstance(cutoff, date):
        return datetime(cutoff.year, cutoff.month, cutoff.day)
    return cutoff


# ============================ public API ============================

def test_connection(source: DataSource) -> tuple[bool, str]:
    """Real connection test for a database-family source (SQL engines + Mongo)."""
    try:
        if _is_mongo(source):
            client, _ = _mongo_db(source)
            try:
                client.admin.command("ping")
                return True, "Connection successful."
            finally:
                client.close()
        engine = build_engine(source)
        try:
            probe = "SELECT 1 FROM DUAL" if engine.dialect.name == "oracle" else "SELECT 1"
            with engine.connect() as conn:
                conn.execute(text(probe))
            return True, "Connection successful."
        finally:
            engine.dispose()
    except Exception as exc:  # noqa: BLE001 — surface the driver's message
        logger.info("Data source %s connection test failed: %s", source.id, exc)
        return False, f"Connection failed: {exc}"


def read_schema(source: DataSource) -> list[TableSchema]:
    """Introspect tables/collections and their columns/fields."""
    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            tables: list[TableSchema] = []
            for coll in db.list_collection_names():
                fields: dict[str, str] = {}
                for doc in db[coll].find().limit(50):
                    for key, value in doc.items():
                        if key not in fields and value is not None:
                            fields[key] = type(value).__name__
                tables.append(TableSchema(schema="", table=coll, columns=list(fields.items())))
            return tables
        finally:
            client.close()

    engine = build_engine(source)
    try:
        inspector = inspect(engine)
        tables = []
        if engine.dialect.name == "mysql":
            for table_name in inspector.get_table_names():
                columns = [(c["name"], str(c["type"])) for c in inspector.get_columns(table_name)]
                tables.append(TableSchema(schema="", table=table_name, columns=columns))
        else:  # postgresql
            for schema in inspector.get_schema_names():
                if schema in _SYSTEM_SCHEMAS or schema.startswith("pg_"):
                    continue
                for table_name in inspector.get_table_names(schema=schema):
                    columns = [
                        (c["name"], str(c["type"]))
                        for c in inspector.get_columns(table_name, schema=schema)
                    ]
                    tables.append(TableSchema(schema=schema, table=table_name, columns=columns))
        return tables
    finally:
        engine.dispose()


def table_dependencies(source: DataSource, table: str) -> TableDependencies:
    """Primary key + foreign-key relationships for a table. Used by the retention
    dry-run to warn that deleting rows could violate referential integrity."""
    if _is_mongo(source):
        return TableDependencies(
            has_primary_key=True,
            primary_key_columns=["_id"],
            referencing_tables=[],
            referenced_tables=[],
            supported=False,
            note="MongoDB has no foreign-key constraints — check references in your application.",
        )

    engine = build_engine(source)
    try:
        inspector = inspect(engine)
        schema, tbl = (table.split(".", 1) if "." in table else (None, table))

        try:
            pk_cols = inspector.get_pk_constraint(tbl, schema=schema).get("constrained_columns") or []
        except Exception:  # noqa: BLE001
            pk_cols = []

        referenced: list[str] = []
        try:
            for fk in inspector.get_foreign_keys(tbl, schema=schema):
                rt = fk.get("referred_table")
                if rt:
                    referenced.append(rt)
        except Exception:  # noqa: BLE001
            pass

        # Children: scan the other tables in scope for FKs pointing back at us.
        referencing: list[str] = []
        try:
            if engine.dialect.name == "mysql" or schema is not None:
                schemas = [schema]
            else:
                schemas = [
                    s for s in inspector.get_schema_names()
                    if s not in _SYSTEM_SCHEMAS and not s.startswith("pg_")
                ]
            seen: set[str] = set()
            for sch in schemas:
                for other in inspector.get_table_names(schema=sch):
                    if other == tbl:
                        continue
                    for fk in inspector.get_foreign_keys(other, schema=sch):
                        if fk.get("referred_table") == tbl and other not in seen:
                            seen.add(other)
                            referencing.append(other)
        except Exception:  # noqa: BLE001
            pass

        return TableDependencies(
            has_primary_key=bool(pk_cols),
            primary_key_columns=pk_cols,
            referencing_tables=sorted(referencing),
            referenced_tables=sorted(set(referenced)),
            supported=True,
        )
    finally:
        engine.dispose()


def sample_table(source: DataSource, table: str, limit: int = 100) -> tuple[list[str], list[tuple]]:
    """Fetch up to `limit` rows/documents. Returns (field_names, rows). Read-only."""
    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            docs = list(db[table].find().limit(limit))
            fields: list[str] = []
            seen: set[str] = set()
            for d in docs:
                for k in d.keys():
                    if k not in seen:
                        seen.add(k)
                        fields.append(k)
            rows = [tuple(d.get(f) for f in fields) for d in docs]
            return fields, rows
        finally:
            client.close()

    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        with engine.connect() as conn:
            result = conn.execute(text(_limited_select(engine, "*", quoted, limit)))
            return list(result.keys()), [tuple(r) for r in result.fetchall()]
    finally:
        engine.dispose()


def fetch_mapped_columns(
    source: DataSource,
    table: str,
    columns: list[str],
    *,
    limit: int = 5000,
    offset: int = 0,
) -> tuple[list[str], list[tuple]]:
    """Fetch specific columns from a table for campaign recipient resolution. Read-only."""
    if not columns:
        return [], []
    for col in columns:
        if not _IDENT_RE.match(col):
            raise ValueError(f"Unsafe column identifier: {col!r}")

    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            projection = {c: 1 for c in columns}
            docs = list(db[table].find({}, projection).skip(offset).limit(limit))
            rows = [tuple(d.get(c) for c in columns) for d in docs]
            return columns, rows
        finally:
            client.close()

    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        prep = engine.dialect.identifier_preparer
        col_sql = ", ".join(prep.quote(c) for c in columns)
        dialect = engine.dialect.name
        if dialect == "mssql":
            sql = text(
                f"SELECT {col_sql} FROM {quoted} ORDER BY (SELECT NULL) "
                f"OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY"
            )
            params = {"offset": offset, "limit": limit}
        elif dialect == "oracle":
            sql = text(
                f"SELECT {col_sql} FROM (SELECT {col_sql}, ROWNUM rn FROM {quoted}) "
                f"WHERE rn > :offset AND rn <= :end_row"
            )
            params = {"offset": offset, "end_row": offset + limit}
        else:
            sql = text(f"SELECT {col_sql} FROM {quoted} LIMIT :limit OFFSET :offset")
            params = {"limit": limit, "offset": offset}
        with engine.connect() as conn:
            result = conn.execute(sql, params)
            return columns, [tuple(r) for r in result.fetchall()]
    finally:
        engine.dispose()


def count_rows_older_than(source: DataSource, table: str, column: str, cutoff: object) -> int:
    """COUNT rows where `column` < cutoff. Read-only."""
    if not _IDENT_RE.match(column):
        raise ValueError(f"Unsafe column identifier: {column!r}")
    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            return int(db[table].count_documents({column: {"$lt": _mongo_cutoff(cutoff)}}))
        finally:
            client.close()

    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        col = engine.dialect.identifier_preparer.quote(column)
        with engine.connect() as conn:
            sql = text(f"SELECT count(*) FROM {quoted} WHERE {col} < :cutoff")
            return int(conn.execute(sql, {"cutoff": cutoff}).scalar() or 0)
    finally:
        engine.dispose()


def query_minors(
    source: DataSource, table: str, dob_column: str, id_column: str | None,
    cutoff: object, limit: int = 5000, email_column: str | None = None,
) -> list[tuple]:
    """Return (id_value, dob_value, email_value) for rows younger than `cutoff`.
    `email_value` is None when `email_column` is not supplied. Read-only."""
    if not _IDENT_RE.match(dob_column):
        raise ValueError(f"Unsafe column identifier: {dob_column!r}")
    if id_column and not _IDENT_RE.match(id_column):
        raise ValueError(f"Unsafe column identifier: {id_column!r}")
    if email_column and not _IDENT_RE.match(email_column):
        raise ValueError(f"Unsafe column identifier: {email_column!r}")
    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            idf = id_column or "_id"
            rows: list[tuple] = []
            for doc in db[table].find({dob_column: {"$gt": _mongo_cutoff(cutoff)}}).limit(limit):
                if doc.get(dob_column) is None:
                    continue
                email = doc.get(email_column) if email_column else None
                rows.append((doc.get(idf), doc.get(dob_column), email))
            return rows
        finally:
            client.close()

    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        prep = engine.dialect.identifier_preparer
        dob = prep.quote(dob_column)
        cols: list[str] = []
        if id_column:
            cols.append(prep.quote(id_column))
        cols.append(dob)
        if email_column:
            cols.append(prep.quote(email_column))
        with engine.connect() as conn:
            sql = text(
                _limited_select(
                    engine,
                    ", ".join(cols),
                    f"{quoted} WHERE {dob} > :cutoff AND {dob} IS NOT NULL",
                    limit,
                )
            )
            result = conn.execute(sql, {"cutoff": cutoff})
            out: list[tuple] = []
            for row in result:
                idx = 0
                id_value = row[idx] if id_column else None
                if id_column:
                    idx += 1
                dob_value = row[idx]
                idx += 1
                email_value = row[idx] if email_column else None
                out.append((id_value, dob_value, email_value))
            return out
    finally:
        engine.dispose()


def find_identifier_column(source: DataSource, table: str) -> str | None:
    """Best-effort primary-key/id column for per-row updates."""
    try:
        cols, _ = sample_table(source, table, 1)
    except Exception:  # noqa: BLE001
        return None
    lower = {c.lower(): c for c in cols}
    for candidate in ("id", "_id", "uuid", "user_id", "customer_id"):
        if candidate in lower:
            return lower[candidate]
    return None


def apply_column_masking(
    source: DataSource,
    table: str,
    column: str,
    id_column: str | None,
    transform,
    limit: int = 50000,
) -> int:
    """DESTRUCTIVE: rewrite `column` in place, applying `transform(value)` to each
    non-null row. Returns rows changed. Requires an id column for SQL sources."""
    if not _IDENT_RE.match(column):
        raise ValueError(f"Unsafe column identifier: {column!r}")

    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            coll = db[table]
            updated = 0
            for doc in coll.find({column: {"$ne": None}}).limit(limit):
                value = doc.get(column)
                masked = transform(value)
                if masked == value:
                    continue
                coll.update_one({"_id": doc["_id"]}, {"$set": {column: masked}})
                updated += 1
            return updated
        finally:
            client.close()

    if not id_column or not _IDENT_RE.match(id_column):
        raise ValueError("An id column is required to apply masking to a SQL source.")
    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        prep = engine.dialect.identifier_preparer
        col = prep.quote(column)
        idc = prep.quote(id_column)
        with engine.begin() as conn:  # one transaction; rolls back on any error
            rows = conn.execute(
                text(_limited_select(engine, f"{idc}, {col}", f"{quoted} WHERE {col} IS NOT NULL", limit))
            ).fetchall()
            updated = 0
            for row_id, value in rows:
                masked = transform(value)
                if masked == value:
                    continue
                conn.execute(
                    text(f"UPDATE {quoted} SET {col} = :v WHERE {idc} = :id"),
                    {"v": masked, "id": row_id},
                )
                updated += 1
            return updated
    finally:
        engine.dispose()


def anonymize_rows_older_than(
    source: DataSource,
    table: str,
    id_column: str | None,
    trigger_field: str,
    cutoff: object,
    column_transforms: list[tuple],
    limit: int = 50000,
) -> int:
    """DESTRUCTIVE: for rows where `trigger_field` < cutoff, rewrite each PII column
    via its transform. `column_transforms` = list of (column_name, fn). Returns rows
    changed. (Anonymise-on-retention: keep the row, scrub the personal fields.)"""
    if not _IDENT_RE.match(trigger_field):
        raise ValueError(f"Unsafe column identifier: {trigger_field!r}")
    for col, _ in column_transforms:
        if not _IDENT_RE.match(col):
            raise ValueError(f"Unsafe column identifier: {col!r}")

    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            coll = db[table]
            updated = 0
            for doc in coll.find({trigger_field: {"$lt": _mongo_cutoff(cutoff)}}).limit(limit):
                changes = {}
                for col, fn in column_transforms:
                    val = doc.get(col)
                    if val is None:
                        continue
                    new_val = fn(val)
                    if new_val != val:
                        changes[col] = new_val
                if changes:
                    coll.update_one({"_id": doc["_id"]}, {"$set": changes})
                    updated += 1
            return updated
        finally:
            client.close()

    if not id_column or not _IDENT_RE.match(id_column):
        raise ValueError("An id column is required to anonymise a SQL source.")
    engine = build_engine(source)
    try:
        prep = engine.dialect.identifier_preparer
        quoted = _sql_quote(engine, table)
        idc = prep.quote(id_column)
        trig = prep.quote(trigger_field)
        col_idents = [prep.quote(col) for col, _ in column_transforms]
        select_list = ", ".join([idc, trig] + col_idents)
        with engine.begin() as conn:
            rows = conn.execute(
                text(f"SELECT {select_list} FROM {quoted} WHERE {trig} < :cutoff"),
                {"cutoff": cutoff},
            ).fetchall()
            updated = 0
            for row in rows[:limit]:
                row_id = row[0]
                set_parts: list[str] = []
                params: dict = {"id": row_id}
                for i, (_, fn) in enumerate(column_transforms):
                    val = row[i + 2]  # offset past id + trigger
                    if val is None:
                        continue
                    new_val = fn(val)
                    if new_val == val:
                        continue
                    set_parts.append(f"{col_idents[i]} = :v{i}")
                    params[f"v{i}"] = new_val
                if set_parts:
                    conn.execute(
                        text(f"UPDATE {quoted} SET {', '.join(set_parts)} WHERE {idc} = :id"), params
                    )
                    updated += 1
            return updated
    finally:
        engine.dispose()


def delete_rows_older_than(source: DataSource, table: str, column: str, cutoff: object) -> int:
    """DELETE rows where `column` < cutoff. DESTRUCTIVE — returns rows deleted."""
    if not _IDENT_RE.match(column):
        raise ValueError(f"Unsafe column identifier: {column!r}")
    if _is_mongo(source):
        client, db = _mongo_db(source)
        try:
            return int(db[table].delete_many({column: {"$lt": _mongo_cutoff(cutoff)}}).deleted_count)
        finally:
            client.close()

    engine = build_engine(source)
    try:
        quoted = _sql_quote(engine, table)
        col = engine.dialect.identifier_preparer.quote(column)
        with engine.begin() as conn:  # transactional; commits on success
            result = conn.execute(text(f"DELETE FROM {quoted} WHERE {col} < :cutoff"), {"cutoff": cutoff})
            return result.rowcount or 0
    finally:
        engine.dispose()
