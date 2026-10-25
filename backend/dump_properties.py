import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.integration_property import IntegrationProperty
from app.models.property_banner_association import PropertyBannerAssociation
from app.models.consent_banner import ConsentBanner

db = SessionLocal()
print("=== Properties ===")
props = db.query(IntegrationProperty).all()
for p in props:
    print(f"ID: {p.id} | Domain: {p.domain} | Org: {p.organization_id} | Status: {p.status}")

print("=== Banners ===")
banners = db.query(ConsentBanner).all()
for b in banners:
    print(f"ID: {b.id} | Name: {b.name} | Org: {b.organization_id} | Properties: {b.properties}")

print("=== Associations ===")
assocs = db.query(PropertyBannerAssociation).all()
for a in assocs:
    print(f"PropID: {a.property_id} | BannerID: {a.banner_id} | Status: {a.status}")

print("=== Users ===")
from app.models.user import User
users = db.query(User).all()
for u in users:
    print(f"ID: {u.id} | Email: {u.email} | Role: {u.role} | Status: {u.status} | OrgID: {u.organization_id}")

