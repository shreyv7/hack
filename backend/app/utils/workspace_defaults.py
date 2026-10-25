"""Default workspace settings payload for new organizations."""

from app.models.organization_settings import DeploymentModel, DpdpRole, OrganizationSettings


DEFAULT_DATA_RESIDENCY = [
    {
        "category": "Consent records",
        "region": "Mumbai",
        "cross_border": False,
        "legal_basis": "",
        "details": "",
    },
    {
        "category": "PII detected",
        "region": "Mumbai",
        "cross_border": False,
        "legal_basis": "",
        "details": "",
    },
    {
        "category": "Audit logs",
        "region": "Mumbai + Hyderabad",
        "cross_border": False,
        "legal_basis": "",
        "details": "",
    },
    {
        "category": "Aggregated analytics",
        "region": "Global",
        "cross_border": True,
        "legal_basis": "Anonymized only",
        "details": "",
    },
]


def create_default_organization_settings(organization_id) -> OrganizationSettings:
    return OrganizationSettings(
        organization_id=organization_id,
        secondary_industries=[],
        deployment_model=DeploymentModel.public,
        primary_region="Mumbai (ap-south-1)",
        backup_region="Hyderabad (ap-south-2)",
        allowed_regions=["Mumbai", "Hyderabad", "Singapore", "Frankfurt"],
        data_residency=list(DEFAULT_DATA_RESIDENCY),
        dpdp_role=DpdpRole.data_fiduciary,
        is_significant_data_fiduciary=False,
    )
