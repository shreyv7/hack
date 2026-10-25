import { downloadEvidencePackPdf, downloadFullEvidencePackPdf } from '@/lib/workspace/evidencePackPdf';
import type { DpdpObligation, WorkspaceSettings } from '@/types/workspace';

export type EvidencePackSection = 'profile' | 'industry' | 'deployment' | 'role-mapping';

export interface EvidencePackMeta {
  exportedAt: string;
  section: EvidencePackSection;
  sectionTitle: string;
  exporterEmail?: string;
  exporterRole?: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export const SECTION_TITLES: Record<EvidencePackSection, string> = {
  profile: 'Workspace Info — Organization Profile & Compliance',
  industry: 'Industry Configuration',
  deployment: 'Deployment & Data Residency',
  'role-mapping': 'DPDP Role Mapping & Processors',
};

/** Order used for full Settings evidence pack PDF. */
export const ALL_EVIDENCE_PACK_SECTIONS: EvidencePackSection[] = [
  'profile',
  'industry',
  'deployment',
  'role-mapping',
];

function profilePayload(settings: WorkspaceSettings) {
  return {
    registered_address: settings.registered_address,
    headquarters: settings.headquarters,
    india_presence: settings.india_presence,
    solution_description: settings.solution_description,
    logo_url: settings.logo_url,
    dpo_name: settings.dpo_name,
    dpo_email: settings.dpo_email,
    dpo_phone: settings.dpo_phone,
    compliance_version: settings.compliance_version,
    changelog_summary: settings.changelog_summary,
    self_attested_at: settings.self_attested_at,
    third_party_audit_firm: settings.third_party_audit_firm,
    audit_valid_until: settings.audit_valid_until,
  };
}

function industryPayload(settings: WorkspaceSettings) {
  return {
    primary_industry: settings.primary_industry,
    secondary_industries: settings.secondary_industries,
    is_significant_data_fiduciary: settings.is_significant_data_fiduciary,
    data_principals_count_band: settings.data_principals_count_band,
    annual_turnover_band: settings.annual_turnover_band,
  };
}

function deploymentPayload(settings: WorkspaceSettings) {
  return {
    deployment_model: settings.deployment_model,
    primary_region: settings.primary_region,
    backup_region: settings.backup_region,
    allowed_regions: settings.allowed_regions,
    data_residency: settings.data_residency,
  };
}

function roleMappingPayload(settings: WorkspaceSettings, obligations: DpdpObligation[]) {
  return {
    dpdp_role: settings.dpdp_role,
    role_assessed_at: settings.role_assessed_at,
    role_assessment: settings.role_assessment,
    is_significant_data_fiduciary: settings.is_significant_data_fiduciary,
    data_principals_count_band: settings.data_principals_count_band,
    annual_turnover_band: settings.annual_turnover_band,
    obligation_matrix: obligations,
    data_processors: settings.processors,
  };
}

export function buildEvidencePack(
  section: EvidencePackSection,
  settings: WorkspaceSettings,
  obligations: DpdpObligation[],
  meta: Omit<EvidencePackMeta, 'section' | 'sectionTitle' | 'organization'> & {
    exporterEmail?: string;
    exporterRole?: string;
  }
): EvidencePackMeta & { data: Record<string, unknown> } {
  const base: EvidencePackMeta = {
    exportedAt: meta.exportedAt,
    section,
    sectionTitle: SECTION_TITLES[section],
    exporterEmail: meta.exporterEmail,
    exporterRole: meta.exporterRole,
    organization: {
      id: settings.organization.id,
      name: settings.organization.name,
      slug: settings.organization.slug,
    },
  };

  let data: Record<string, unknown>;
  switch (section) {
    case 'profile':
      data = { workspace_profile: profilePayload(settings) };
      break;
    case 'industry':
      data = { industry_configuration: industryPayload(settings) };
      break;
    case 'deployment':
      data = { deployment_and_residency: deploymentPayload(settings) };
      break;
    case 'role-mapping':
      data = { dpdp_role_mapping: roleMappingPayload(settings, obligations) };
      break;
  }

  return { ...base, data };
}

export function downloadEvidencePack(
  section: EvidencePackSection,
  settings: WorkspaceSettings,
  obligations: DpdpObligation[],
  options: { exporterEmail?: string; exporterRole?: string }
): string {
  return downloadEvidencePackPdf(section, settings, obligations, options);
}

export function downloadFullEvidencePack(
  settings: WorkspaceSettings,
  obligations: DpdpObligation[],
  options: { exporterEmail?: string; exporterRole?: string }
): string {
  return downloadFullEvidencePackPdf(settings, obligations, options);
}
