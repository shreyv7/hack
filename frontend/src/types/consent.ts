export type LegalBasis = 'consent' | 'legitimate_use';

export type NoticeVersionStatus =
  | 'draft'
  | 'pending_legal'
  | 'pending_dpo'
  | 'dpo_approved'
  | 'live'
  | 'archived';

export interface ComplianceWarning {
  code: string;
  message: string;
}

export interface Purpose {
  id: string;
  name: string;
  legal_basis: LegalBasis;
  data_categories: string[];
  retention_period: string;
  description: string | null;
  is_special_category: boolean;
  version: string;
  last_reviewed_at: string | null;
  archived_at: string | null;
  linked_notices_count: number;
  translations?: Record<string, any> | null;
}

export interface LinkedNoticeSummary {
  notice_id: string;
  notice_name: string;
  version_id: string;
  version_number: number;
  version_label: string;
  status: NoticeVersionStatus;
}

export interface PurposeDetail extends Purpose {
  linked_notices: LinkedNoticeSummary[];
}

export interface PurposeCreate {
  name: string;
  legal_basis?: LegalBasis;
  data_categories?: string[];
  retention_period?: string;
  description?: string | null;
  is_special_category?: boolean;
  translations?: Record<string, any> | null;
}

export interface PurposeUpdate {
  name?: string;
  legal_basis?: LegalBasis;
  data_categories?: string[];
  retention_period?: string;
  description?: string | null;
  is_special_category?: boolean;
  translations?: Record<string, any> | null;
}

export interface NoticeVersion {
  id: string;
  notice_id: string;
  version_number: number;
  status: NoticeVersionStatus;
  display_name: string;
  language: string;
  opening_statement: string;
  contact_email: string | null;
  contact_website: string | null;
  dpo_name: string | null;
  dpo_email: string | null;
  rights_exercise: string;
  complaint_process: string;
  retention_policy: string;
  compliance_warnings: ComplianceWarning[];
  published_at: string | null;
  published_by_user_id: string | null;
  submitted_at?: string | null;
  legal_reviewed_at?: string | null;
  legal_reviewed_by_user_id?: string | null;
  dpo_approved_at?: string | null;
  dpo_approved_by_user_id?: string | null;
  approval_notes?: Array<{ action: string; by: string; comment?: string | null; at: string }> | null;
  purpose_ids: string[];
  purposes: Purpose[];
  translations?: Record<string, any> | null;
}

export interface NoticeApprovalQueueItem {
  notice_id: string;
  notice_internal_name: string;
  version_id: string;
  version_number: number;
  version_label: string;
  status: NoticeVersionStatus;
  display_name: string;
  submitted_at: string | null;
  warnings_count: number;
}

export interface NoticeSummary {
  id: string;
  internal_name: string;
  archived_at: string | null;
  current_version_id: string | null;
  version_number: number | null;
  version_label: string | null;
  display_name: string | null;
  status: NoticeVersionStatus | null;
  purposes_count: number;
  warnings_count: number;
  active_since: string | null;
  has_draft: boolean;
}

export interface NoticeDetail {
  id: string;
  internal_name: string;
  archived_at: string | null;
  current_live_version_id: string | null;
  versions: NoticeVersion[];
}

export interface NoticeCreate {
  internal_name: string;
  display_name?: string;
  language?: string;
  opening_statement?: string;
  contact_email?: string;
  contact_website?: string;
  dpo_name?: string;
  dpo_email?: string;
  rights_exercise?: string;
  complaint_process?: string;
  retention_policy?: string;
  translations?: Record<string, any> | null;
}

export interface NoticeVersionContentUpdate {
  display_name?: string;
  language?: string;
  opening_statement?: string;
  contact_email?: string;
  contact_website?: string;
  dpo_name?: string;
  dpo_email?: string;
  rights_exercise?: string;
  complaint_process?: string;
  retention_policy?: string;
  translations?: Record<string, any> | null;
}

export interface ComplianceCheckResult {
  warnings: ComplianceWarning[];
  auto_fixed: boolean;
}

/** Maps wizard NoticeFormData fields to API payload. */
export function noticeFormToCreatePayload(form: {
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
}): NoticeCreate {
  return {
    internal_name: form.noticeTitle,
    display_name: form.displayName,
    language: form.language,
    opening_statement: form.openingStatement,
    contact_email: form.contactEmail || undefined,
    contact_website: form.contactWebsite || undefined,
    dpo_name: form.dpoName || undefined,
    dpo_email: form.dpoEmail || undefined,
    rights_exercise: form.rightsExercise,
    complaint_process: form.complaintProcess,
    retention_policy: form.retentionPolicy,
    translations: {
      grievanceOfficerName: form.grievanceOfficerName || '',
      dpbiEscalationText: form.dpbiEscalationText || '',
      consentWithdrawalMethod: form.consentWithdrawalMethod || '',
      dataCategories: form.dataCategories || '',
    }
  };
}

export function noticeFormToVersionUpdate(form: {
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
}): NoticeVersionContentUpdate {
  return {
    display_name: form.displayName,
    language: form.language,
    opening_statement: form.openingStatement,
    contact_email: form.contactEmail || undefined,
    contact_website: form.contactWebsite || undefined,
    dpo_name: form.dpoName || undefined,
    dpo_email: form.dpoEmail || undefined,
    rights_exercise: form.rightsExercise,
    complaint_process: form.complaintProcess,
    retention_policy: form.retentionPolicy,
    translations: {
      grievanceOfficerName: form.grievanceOfficerName || '',
      dpbiEscalationText: form.dpbiEscalationText || '',
      consentWithdrawalMethod: form.consentWithdrawalMethod || '',
      dataCategories: form.dataCategories || '',
    }
  };
}

export function versionToFormData(version: NoticeVersion): {
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
  grievanceOfficerName: string;
  dpbiEscalationText: string;
  consentWithdrawalMethod: string;
  dataCategories: string;
} {
  const extra = version.translations || {};
  return {
    noticeTitle: '',
    displayName: version.display_name,
    language: version.language,
    openingStatement: version.opening_statement,
    contactEmail: version.contact_email ?? '',
    contactWebsite: version.contact_website ?? '',
    dpoName: version.dpo_name ?? '',
    dpoEmail: version.dpo_email ?? '',
    rightsExercise: version.rights_exercise,
    complaintProcess: version.complaint_process,
    retentionPolicy: version.retention_policy,
    grievanceOfficerName: extra.grievanceOfficerName ?? version.dpo_name ?? '',
    dpbiEscalationText: extra.dpbiEscalationText ?? 'If your grievances are not resolved by the Data Fiduciary within 30 days, you have the statutory legal right to lodge a complaint directly with the Data Protection Board of India (DPBI) at https://dpboard.gov.in.',
    consentWithdrawalMethod: extra.consentWithdrawalMethod ?? 'Users may withdraw their consent at any time via the Rights Portal toggle below, or by contacting the DPO directly.',
    dataCategories: extra.dataCategories ?? '',
  };
}

export function formatReviewDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatActiveSince(iso: string | null | undefined): string {
  return formatReviewDate(iso);
}

export interface ConsentBanner {
  id: string;
  organization_id: string;
  name: string;
  version: string;
  status: 'Live' | 'Draft';
  consents: number;
  deployed_on: { type: string; label: string }[];
  languages: number;
  purposes: number;
  description: string | null;
  banner_purpose_type?: string[];
  banner_purpose_custom?: string | null;
  display_style: string;
  position: string;
  theme: string;
  template: string;
  heading: string | null;
  body_text: string | null;
  cta_accept: string;
  cta_reject: string;
  cta_customize: string;
  cta_withdraw?: string | null;
  show_withdraw_action?: boolean;
  privacy_policy_url: string | null;
  cookie_policy_url: string | null;
  dpo_email: string | null;
  show_language_switcher: boolean;
  ab_test_enabled: boolean;
  ab_variant_theme: string | null;
  ab_variant_display_style: string | null;
  ab_variant_position: string | null;
  ab_variant_template: string | null;
  ab_variant_custom_css: string | null;
  ab_traffic_split: number;
  ab_test_duration_days: number;
  ab_test_started_at?: string | null;
  developer_mode: boolean;
  consent_webhook_url?: string | null;
  custom_css?: string | null;
  properties: string[];
  language_detection_settings?: string | null;
  translations?: Record<string, any> | null;
  consent_notice_id?: string | null;
  consent_valid_days?: number;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface BannerCreate {
  name: string;
  version?: string;
  status?: string;
  consents?: number;
  deployed_on?: { type: string; label: string }[];
  languages?: number;
  purposes?: number;
  description?: string | null;
  banner_purpose_type?: string[];
  banner_purpose_custom?: string | null;
  display_style?: string;
  position?: string;
  theme?: string;
  template?: string;
  heading?: string | null;
  body_text?: string | null;
  cta_accept?: string;
  cta_reject?: string;
  cta_customize?: string;
  cta_withdraw?: string | null;
  show_withdraw_action?: boolean;
  privacy_policy_url?: string | null;
  cookie_policy_url?: string | null;
  dpo_email?: string | null;
  show_language_switcher?: boolean;
  ab_test_enabled?: boolean;
  ab_variant_theme?: string | null;
  ab_variant_display_style?: string | null;
  ab_variant_position?: string | null;
  ab_variant_template?: string | null;
  ab_variant_custom_css?: string | null;
  ab_traffic_split?: number;
  ab_test_duration_days?: number;
  developer_mode?: boolean;
  consent_webhook_url?: string | null;
  custom_css?: string | null;
  properties?: string[];
  language_detection_settings?: string | null;
  translations?: Record<string, any> | null;
  consent_notice_id?: string | null;
}

export interface ConsentActivity {
  id: string;
  organization_id: string;
  banner_id: string | null;
  action: string;
  banner_name: string;
  banner_version: string;
  user_name: string;
  deployed_on: { type: string; label: string }[];
  created_at: string;
  updated_at: string;
}

export interface NoticeActivity {
  id: string;
  organization_id: string;
  notice_id: string | null;
  action: string;
  notice_name: string;
  notice_version: string;
  user_name: string;
  created_at: string;
  updated_at: string;
}

export interface PurposeActivity {
  id: string;
  organization_id: string;
  purpose_id: string | null;
  action: string;
  purpose_name: string;
  purpose_version: string;
  user_name: string;
  created_at: string;
  updated_at: string;
}


