"""
Model registry — import every model so Alembic autogenerate sees all tables.
"""

from app.models.consent import (  # noqa: F401
    ConsentNotice,
    ConsentNoticeVersion,
    Purpose,
    NoticeActivity,
    PurposeActivity,
)
from app.models.policy import (  # noqa: F401
    PolicyDocument,
    PolicyVersion,
    PolicyAcknowledgement,
    PolicyActivity,
)
from app.models.dsar import (  # noqa: F401
    DataRightsActivityEvent,
    DataRightsReminderEvent,
    DataRightsRequest,
)
from app.models.ai_conversation import AiConversation, AiMessage  # noqa: F401
from app.models.anonymisation import AnonymisationJob  # noqa: F401
from app.models.anonymisation_download_log import AnonymisationDownloadLog  # noqa: F401
from app.models.child_data import ChildDataRecord  # noqa: F401
from app.models.data_inventory import (  # noqa: F401
    DataInventoryAsset,
    DataInventoryAssetActivity,
    DataInventoryAssetProcessor,
    DataInventoryAuditLog,
    DataInventoryField,
)
from app.models.data_processor import DataProcessor  # noqa: F401
from app.models.data_source import DataSource, DataSourceActivity  # noqa: F401
from app.models.dpdp_obligation_definition import DpdpObligationDefinition  # noqa: F401
from app.models.integration_analytics import IntegrationAnalyticsDaily  # noqa: F401
from app.models.integration_api_key import IntegrationApiKey  # noqa: F401
from app.models.integration_event import IntegrationEvent  # noqa: F401
from app.models.integration_property import IntegrationProperty, PropertyType  # noqa: F401
from app.models.masking import MaskingRule  # noqa: F401
from app.models.masking_run import MaskingRun  # noqa: F401
from app.models.organization import Organization  # noqa: F401
from app.models.pii_scan import PiiFinding, PiiScanJob, PiiScanSchedule  # noqa: F401
from app.models.retention import RetentionPolicy, RetentionRun  # noqa: F401
from app.models.retention_obligation import RetentionObligation  # noqa: F401
from app.models.organization_settings import OrganizationSettings  # noqa: F401
from app.models.page_coverage_scan import PageCoverageScan, CoveragePage  # noqa: F401
from app.models.property_banner_association import PropertyBannerAssociation  # noqa: F401
from app.models.property_verification import PropertyVerification  # noqa: F401
from app.models.consent_principal import ConsentPrincipal, ConsentPrincipalIdentifier  # noqa: F401
from app.models.consent_capture_session import ConsentCaptureSession  # noqa: F401
from app.models.consent_receipt import ConsentReceipt  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.user_scope_assignment import UserScopeAssignment  # noqa: F401
from app.models.cookie_scan_job import CookieScanJob  # noqa: F401
from app.models.detected_tracker import DetectedTracker  # noqa: F401
from app.models.tracker_override import TrackerOverride  # noqa: F401
from app.models.compliance import (  # noqa: F401
    AuditLogEntry,
    AuditLogVerification,
    BreachIncident,
    BreachNotification,
    DpdpaFeatureMapping,
    DpdpaStatuteSection,
    SecurityCertification,
    SecurityControl,
)
from app.models.consent_banner import ConsentBanner, ConsentActivity  # noqa: F401
from app.models.consent_manager import ConsentManagerConnection  # noqa: F401
from app.models.property_deployment import (  # noqa: F401
    PropertyDeployment,
    DeploymentConfigurationVersion,
    DeploymentHeartbeat,
    DeploymentPlatform,
    DeploymentStatus,
)
from app.models.tag_manager import (  # noqa: F401
    TagManagerContainer,
    ManagedTag,
    TagExecutionRule,
    TagViolation,
    TagManagerDailyMetric,
    TagExecutionLog,
    TagManagerSettings,
)
from app.models.notice_delivery import (  # noqa: F401
    NoticeCampaign,
    CampaignDelivery,
    DeliveryAttempt,
    DeliveryEvent,
    NoticeDeliveryProvider,
    ProviderCredential,
    DeliveryTemplate,
    ScheduledJob,
    RetryPolicy,
    DeliveryAnalyticsDaily,
    RecipientDeliveryStatus,
    UserNotification,
)
from app.models.proof_vault import (  # noqa: F401
    ProofVaultRecord,
    ProofVaultVerification,
)
from app.models.dpia import (  # noqa: F401
    Dpia,
    DpiaVersion,
    DpiaStep,
    DpiaStepAnswer,
    DpiaRisk,
    DpiaControlLibrary,
    DpiaControl,
    DpiaApproval,
    DpiaReviewCycle,
    DpiaTask,
    DpiaEvidence,
    DpiaComment,
    DpiaEvent,
    DpiaReport,
    DpiaTemplate,
    DpiaDataflow,
    DpiaAsset,
    DpiaComplianceCheck,
)
from app.models.ropa import (  # noqa: F401
    BusinessUnit,
    Department,
    Team,
    ProcessingActivity,
    ActivityVersion,
    ActivityOwner,
    ActivityPurpose,
    ActivityDataCategory,
    ActivityDataPrincipal,
    ActivityLawfulBasis,
    ActivitySystem,
    ActivityRecipient,
    ActivityCrossBorderTransfer,
    ActivityRetentionPolicy,
    ActivityDataSource,
    ActivitySecurityMeasure,
    ActivityDpiaLink,
    ActivityApproval,
    ActivityEvent,
    RopaDiscoverySuggestion,
)
from app.models.ciso import (  # noqa: F401
    CisoFramework,
    CisoRequirement,
    CisoControl,
    CisoControlRequirementMapping,
    CisoEvidence,
    CisoControlEvidenceMapping,
    CisoRisk,
    CisoControlRiskMapping,
    CisoRemediationTask,
    CisoControlTaskMapping,
    CisoException,
    CisoBoardReport,
    CisoScoreSnapshot,
    CisoControlComment,
    CisoControlReview,
    CisoScoreSettings,
    CisoControlVersion,
    CisoActivity,
    CisoControlDpiaMapping,
    CisoControlRopaMapping,
    CisoControlVendorMapping,
    CisoControlIncidentMapping,
    CisoControlProofMapping,
    CisoControlAuditMapping,
    CisoOrganizationControl,
    CisoControlPolicyMapping,
    SecurityAsset,
    CisoControlAssetMapping,
    VulnerabilityScanLog,
)
from app.models.doc_embedding import DocEmbedding  # noqa: F401
from app.models.governance_dashboard import (  # noqa: F401
    GovernanceDashboard,
    GovernanceDashboardAudit,
    GovernanceDashboardFavorite,
    GovernanceDashboardSchedule,
    GovernanceDashboardShare,
    GovernanceDashboardVersion,
    GovernanceWidget,
)
from app.models.enforcement import (  # noqa: F401
    EnforcementEvent,
    PurposeDataMapping,
    PurposeEnforcementConfig,
    WithdrawalRemediationTask,
)
from app.models.overlay import OverlayComment  # noqa: F401
from app.models.cross_border_transfer import (  # noqa: F401
    CbtContract,
    CbtContractVersion,
    CbtSdfAssessment,
    CbtActivity,
)
from app.models.refresh_token import RefreshTokenSession  # noqa: F401
from app.models.legitimate_use import LegitimateUseRecord  # noqa: F401
from app.models.regulatory_proceeding import RegulatoryProceeding  # noqa: F401


