"""Script to clear all database records except the Vajra Sandbox Org and superadmin user."""

from sqlalchemy import text
from app.core.database import SessionLocal

def clear_database():
    db = SessionLocal()
    try:
        # Get all table names in public schema
        result = db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"))
        tables = [row[0] for row in result]
        
        # Exclude tables we want to preserve
        exclude = ["alembic_version", "organizations", "users"]
        truncate_tables = [t for t in tables if t not in exclude]
        
        if truncate_tables:
            print(f"Truncating {len(truncate_tables)} tables...")
            # Build and execute truncate command
            truncate_query = f"TRUNCATE TABLE {', '.join(truncate_tables)} CASCADE;"
            db.execute(text(truncate_query))
            db.commit()
        
        # Now clean up organizations and users to keep only the sandbox org and superadmin user
        print("Cleaning up users and organizations...")
        db.execute(text("DELETE FROM users WHERE email != 'superadmin@vajra.dev';"))
        db.execute(text("DELETE FROM organizations WHERE slug != 'vajra-sandbox-org';"))
        db.commit()
        
        print("=== DATABASE CLEARED SUCCESSFULLY ===")
        print("Kept: Organization 'Vajra Sandbox Org' and User 'superadmin@vajra.dev'")
    except Exception as e:
        db.rollback()
        print(f"Error clearing database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    clear_database()
