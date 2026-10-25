/**
 * Shared application types.
 *
 * Cross-cutting types that are reused by multiple components live here.
 * Component-specific prop interfaces stay co-located with their component.
 */

/** Visual size scale shared by sizeable design-system primitives. */
export type Size = 'xs' | 'sm' | 'md' | 'lg';

/** Subset of {@link Size} used by components without an extra-small variant. */
export type ControlSize = 'sm' | 'md' | 'lg';

/** Semantic status colors used by badges, toasts and alerts. */
export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'neutral';

/** Status values rendered by the {@link StatusPill} component. */
export type PillStatus =
  | 'live'
  | 'draft'
  | 'archived'
  | 'pending_legal'
  | 'pending_dpo'
  | 'dpo_approved'
  | 'active'
  | 'inactive'
  | 'pending'
  | 'completed'
  | 'high'
  | 'medium'
  | 'low'
  | 'critical'
  | 'resolved'
  | 'open'
  | 'closed'
  | 'verified'
  | 'consent'
  | 'legit-use'
  | 'contract'
  | 'legal-obligation';

/** Button visual variants. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Card visual variants. */
export type CardVariant = 'default' | 'elevated' | 'interactive';

/** Tab bar visual style. */
export type TabVariant = 'underline' | 'pill';

/** Trend direction for metric deltas. */
export type TrendDirection = 'up' | 'down';

/** Timeline node status color. */
export type TimelineStatus = 'success' | 'warning' | 'danger';

/** Data-source connection state. */
export type DataSourceStatus = 'connected' | 'error';

/** Supported HTML input types for {@link InputField}. */
export type InputFieldType = 'text' | 'email' | 'url' | 'search';

/** Numeric diameter presets for the UI-layer {@link ComplianceGauge}. */
export type GaugeDiameter = 80 | 120 | 200;

export * from './auth';
export * from './workspace';
export * from './integrations';
export * from './integration_verification';
export * from './integration_metrics';
export * from './ciso';

export * from './cross_border_transfer';

/** Lifecycle status for a consent notice row. */
export type NoticeLifecycleStatus = 'live' | 'draft';


/** Form state for the new-consent-notice wizard. */
export interface NoticeFormData {
  noticeTitle: string;
  displayName: string;
  language: string;
  openingStatement: string;
  contactEmail: string;
  contactWebsite: string;
  dpoName: string;
  dpoEmail: string;
  rightsExercise: string;
  complaintProcess: string;
  retentionPolicy: string;
  grievanceOfficerName?: string;
  dpbiEscalationText?: string;
  consentWithdrawalMethod?: string;
  dataCategories?: string;
}

/** Summary record rendered by {@link NoticeRow}. */
export interface NoticeRecord {
  name: string;
  version: string;
  status: NoticeLifecycleStatus;
  purposes: number;
  created: string;
  active: string | null;
  warning: string | null;
}

/**
 * All navigable pages in the application shell.
 *
 * Used by {@link App} routing and the {@link Sidebar} navigation handler.
 */
export type Page =
  | 'how-to-use'
  | 'governance-guide'
  | 'data-protection-guide'
  | 'compliance-guide'
  | 'dashboard'
  | 'notices'
  | 'new-notice'
  | 'purposes'
  | 'portal'
  | 'incidents'
  | 'incident-detail'
  | 'pii-scanner'
  | 'data-sources'
  | 'copilot'
  | 'compliance-score'
  | 'welcome-setup'
  | 'empty-notices'
  | 'empty-sources'
  | 'diagram-consent'
  | 'diagram-pii'
  | 'diagram-score'
  | 'proof-vault'
  | 'consent-enforcement'
  | 'cookie-scanner'
  | 'childrens-data'
  | 'ciso-command'
  | 'policy-manager'
  | 'vendor-risk'
  | 'monitoring-scheduling'
  | 'workspace-info'
  | 'deployment-settings'
  | 'industry-config'
  | 'dpdp-role-mapping'
  | 'consent-notices-manager'
  | 'received-consents'
  | 'cookie-tracker-manager'
  | 'purpose-registry-new'
  | 'multi-language-editor'
  | 'data-rights-portal-public'
  | 'dsar-sla-tracker'
  | 'dsar-activity-log'
  | 'security-safeguards-hub'
  | 'breach-disclosure-wizard'
  | 'retention-policy-manager'
  | 'audit-log'
  | 'consent-withdrawal-flow'
  | 'notice-delivery-channels'
  | 'consent-campaigns'
  | 'pluggable-provider-adapters'
  | 'consent-manager-integration'
  | 'data-anonymisation'
  | 'data-masking'
  | 'compliance-dashboard-builder'
  | 'dpia-module'
  | 'ropa-module'
  | 'data-inventory'
  | 'banner-builder'
  | 'dpdpa-map'
  | 'integrations-overview'
  | 'technical-integration'
  | 'integration-website'
  | 'integration-mobile'
  | 'integration-api'
  | 'tag-manager'
  | 'integration-dsar-widget'
  | 'integration-preference-center'
  | 'integration-pii-agent'
  | 'integration-campaign-tracking'
  | 'dpdpa-consent-managers'
  | 'automation-coverage'
  | 'organization-management'
  | 'team-management'
  | 'pending-approvals'
  | 'cross-border-transfer';
