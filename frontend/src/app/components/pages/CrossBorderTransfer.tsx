import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import {
  Plus,
  Download,
  X,
  AlertTriangle,
  Globe,
  Send,
  Loader2,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { StatusPill } from '@/app/components/common/StatusPill';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { fetchWorkspace } from '@/lib/api/workspace';
import type { DataProcessor, WorkspaceSettings } from '@/types/workspace';
import type { PillStatus } from '@/types';
import {
  fetchCbtDashboard,
  fetchCbtTransfers,
  createCbtTransfer,
  updateCbtTransfer,
  deleteCbtTransfer,
  fetchCbtContracts,
  createCbtContract,
  fetchCbtContract,
  signCbtContract,
  downloadContractPdf,
  triggerCbtNoticeCampaign,
  createCbtSdfAssessment,
  fetchCbtSdfAssessments,
  fetchCbtActivities,
} from '@/lib/api/cbt';
import { fetchDPIAs } from '@/lib/api/dpia';
import type { DPIARecord } from '@/lib/api/dpia';
import type {
  CbtTransfer,
  CbtContract,
  CbtContractDetail,
  CbtSdfAssessment,
  CbtActivity,
  CbtDashboardKpis,
} from '@/types/cross_border_transfer';

const COUNTRIES_LIST = [
  { name: 'Afghanistan', code: 'AFG' },
  { name: 'Albania', code: 'ALB' },
  { name: 'Algeria', code: 'DZA' },
  { name: 'Andorra', code: 'AND' },
  { name: 'Angola', code: 'AGO' },
  { name: 'Argentina', code: 'ARG' },
  { name: 'Armenia', code: 'ARM' },
  { name: 'Australia', code: 'AUS' },
  { name: 'Austria', code: 'AUT' },
  { name: 'Azerbaijan', code: 'AZE' },
  { name: 'Bahamas', code: 'BHS' },
  { name: 'Bahrain', code: 'BHR' },
  { name: 'Bangladesh', code: 'BGD' },
  { name: 'Belarus', code: 'BLR' },
  { name: 'Belgium', code: 'BEL' },
  { name: 'Belize', code: 'BLZ' },
  { name: 'Benin', code: 'BEN' },
  { name: 'Bhutan', code: 'BTN' },
  { name: 'Bolivia', code: 'BOL' },
  { name: 'Bosnia and Herzegovina', code: 'BIH' },
  { name: 'Botswana', code: 'BWA' },
  { name: 'Brazil', code: 'BRA' },
  { name: 'Brunei', code: 'BRN' },
  { name: 'Bulgaria', code: 'BGR' },
  { name: 'Burkina Faso', code: 'BFA' },
  { name: 'Burundi', code: 'BDI' },
  { name: 'Cambodia', code: 'KHM' },
  { name: 'Cameroon', code: 'CMR' },
  { name: 'Canada', code: 'CAN' },
  { name: 'Cape Verde', code: 'CPV' },
  { name: 'Central African Republic', code: 'CAF' },
  { name: 'Chad', code: 'TCD' },
  { name: 'Chile', code: 'CHL' },
  { name: 'China', code: 'CHN' },
  { name: 'Colombia', code: 'COL' },
  { name: 'Comoros', code: 'COM' },
  { name: 'Congo', code: 'COG' },
  { name: 'Costa Rica', code: 'CRI' },
  { name: 'Croatia', code: 'HRV' },
  { name: 'Cuba', code: 'CUB' },
  { name: 'Cyprus', code: 'CYP' },
  { name: 'Czech Republic', code: 'CZE' },
  { name: 'Denmark', code: 'DNK' },
  { name: 'Djibouti', code: 'DJI' },
  { name: 'Dominica', code: 'DMA' },
  { name: 'Dominican Republic', code: 'DOM' },
  { name: 'Ecuador', code: 'ECU' },
  { name: 'Egypt', code: 'EGY' },
  { name: 'El Salvador', code: 'SLV' },
  { name: 'Equatorial Guinea', code: 'GNQ' },
  { name: 'Eritrea', code: 'ERI' },
  { name: 'Estonia', code: 'EST' },
  { name: 'Eswatini', code: 'SWZ' },
  { name: 'Ethiopia', code: 'ETH' },
  { name: 'Fiji', code: 'FJI' },
  { name: 'Finland', code: 'FIN' },
  { name: 'France', code: 'FRA' },
  { name: 'Gabon', code: 'GAB' },
  { name: 'Gambia', code: 'GMB' },
  { name: 'Georgia', code: 'GEO' },
  { name: 'Germany', code: 'DEU' },
  { name: 'Ghana', code: 'GHA' },
  { name: 'Greece', code: 'GRC' },
  { name: 'Grenada', code: 'GRD' },
  { name: 'Guatemala', code: 'GTM' },
  { name: 'Guinea', code: 'GIN' },
  { name: 'Guinea-Bissau', code: 'GNB' },
  { name: 'Guyana', code: 'GUY' },
  { name: 'Haiti', code: 'HTI' },
  { name: 'Honduras', code: 'HND' },
  { name: 'Hungary', code: 'HUN' },
  { name: 'Iceland', code: 'ISL' },
  { name: 'India', code: 'IND' },
  { name: 'Indonesia', code: 'IDN' },
  { name: 'Iran', code: 'IRN' },
  { name: 'Iraq', code: 'IRQ' },
  { name: 'Ireland', code: 'IRL' },
  { name: 'Israel', code: 'ISR' },
  { name: 'Italy', code: 'ITA' },
  { name: 'Jamaica', code: 'JAM' },
  { name: 'Japan', code: 'JPN' },
  { name: 'Jordan', code: 'JOR' },
  { name: 'Kazakhstan', code: 'KAZ' },
  { name: 'Kenya', code: 'KEN' },
  { name: 'Kiribati', code: 'KIR' },
  { name: 'Kosovo', code: 'XKX' },
  { name: 'Kuwait', code: 'KWT' },
  { name: 'Kyrgyzstan', code: 'KGZ' },
  { name: 'Laos', code: 'LAO' },
  { name: 'Latvia', code: 'LVA' },
  { name: 'Lebanon', code: 'LBN' },
  { name: 'Lesotho', code: 'LSO' },
  { name: 'Liberia', code: 'LBR' },
  { name: 'Libya', code: 'LBY' },
  { name: 'Liechtenstein', code: 'LIE' },
  { name: 'Lithuania', code: 'LTU' },
  { name: 'Luxembourg', code: 'LUX' },
  { name: 'Madagascar', code: 'MDG' },
  { name: 'Malawi', code: 'MWI' },
  { name: 'Malaysia', code: 'MYS' },
  { name: 'Maldives', code: 'MDV' },
  { name: 'Mali', code: 'MLI' },
  { name: 'Malta', code: 'MLT' },
  { name: 'Marshall Islands', code: 'MHL' },
  { name: 'Mauritania', code: 'MRT' },
  { name: 'Mauritius', code: 'MUS' },
  { name: 'Mexico', code: 'MEX' },
  { name: 'Micronesia', code: 'FSM' },
  { name: 'Moldova', code: 'MDA' },
  { name: 'Monaco', code: 'MCO' },
  { name: 'Mongolia', code: 'MNG' },
  { name: 'Montenegro', code: 'MNE' },
  { name: 'Morocco', code: 'MAR' },
  { name: 'Mozambique', code: 'MOZ' },
  { name: 'Myanmar', code: 'MMR' },
  { name: 'Namibia', code: 'NAM' },
  { name: 'Nauru', code: 'NRU' },
  { name: 'Nepal', code: 'NPL' },
  { name: 'Netherlands', code: 'NLD' },
  { name: 'New Zealand', code: 'NZL' },
  { name: 'Nicaragua', code: 'NIC' },
  { name: 'Niger', code: 'NER' },
  { name: 'Nigeria', code: 'NGA' },
  { name: 'North Korea', code: 'PRK' },
  { name: 'North Macedonia', code: 'MKD' },
  { name: 'Norway', code: 'NOR' },
  { name: 'Oman', code: 'OMN' },
  { name: 'Pakistan', code: 'PAK' },
  { name: 'Palau', code: 'PLW' },
  { name: 'Panama', code: 'PAN' },
  { name: 'Papua New Guinea', code: 'PNG' },
  { name: 'Paraguay', code: 'PRY' },
  { name: 'Peru', code: 'PER' },
  { name: 'Philippines', code: 'PHL' },
  { name: 'Poland', code: 'POL' },
  { name: 'Portugal', code: 'PRT' },
  { name: 'Qatar', code: 'QAT' },
  { name: 'Romania', code: 'ROU' },
  { name: 'Russia', code: 'RUS' },
  { name: 'Rwanda', code: 'RWA' },
  { name: 'Samoa', code: 'WSM' },
  { name: 'San Marino', code: 'SMR' },
  { name: 'Saudi Arabia', code: 'SAU' },
  { name: 'Senegal', code: 'SEN' },
  { name: 'Serbia', code: 'SRB' },
  { name: 'Seychelles', code: 'SYC' },
  { name: 'Sierra Leone', code: 'SLE' },
  { name: 'Singapore', code: 'SGP' },
  { name: 'Slovakia', code: 'SVK' },
  { name: 'Slovenia', code: 'SVN' },
  { name: 'Solomon Islands', code: 'SLB' },
  { name: 'Somalia', code: 'SOM' },
  { name: 'South Africa', code: 'ZAF' },
  { name: 'South Korea', code: 'KOR' },
  { name: 'South Sudan', code: 'SSD' },
  { name: 'Spain', code: 'ESP' },
  { name: 'Sri Lanka', code: 'LKA' },
  { name: 'Sudan', code: 'SDN' },
  { name: 'Suriname', code: 'SUR' },
  { name: 'Sweden', code: 'SWE' },
  { name: 'Switzerland', code: 'CHE' },
  { name: 'Syria', code: 'SYR' },
  { name: 'Taiwan', code: 'TWN' },
  { name: 'Tajikistan', code: 'TJK' },
  { name: 'Tanzania', code: 'TZA' },
  { name: 'Thailand', code: 'THA' },
  { name: 'Timor-Leste', code: 'TLS' },
  { name: 'Togo', code: 'TGO' },
  { name: 'Tonga', code: 'TON' },
  { name: 'Trinidad and Tobago', code: 'TTO' },
  { name: 'Tunisia', code: 'TUN' },
  { name: 'Turkey', code: 'TUR' },
  { name: 'Turkmenistan', code: 'TKM' },
  { name: 'Tuvalu', code: 'TUV' },
  { name: 'Uganda', code: 'UGA' },
  { name: 'Ukraine', code: 'UKR' },
  { name: 'United Arab Emirates', code: 'ARE' },
  { name: 'United Kingdom', code: 'GBR' },
  { name: 'United States', code: 'USA' },
  { name: 'Uruguay', code: 'URY' },
  { name: 'Uzbekistan', code: 'UZB' },
  { name: 'Vanuatu', code: 'VUT' },
  { name: 'Vatican City', code: 'VAT' },
  { name: 'Venezuela', code: 'VEN' },
  { name: 'Vietnam', code: 'VNM' },
  { name: 'Yemen', code: 'YEM' },
  { name: 'Zambia', code: 'ZMB' },
  { name: 'Zimbabwe', code: 'ZWE' }
];

type TabId = 'transfers' | 'contracts' | 'notices' | 'sdf' | 'audit';

function mapStatus(status: string): PillStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'draft':
      return 'draft';
    case 'suspended':
      return 'inactive';
    case 'terminated':
      return 'closed';
    case 'signed':
      return 'completed';
    case 'under_review':
      return 'pending';
    case 'approved':
      return 'resolved';
    case 'expired':
      return 'archived';
    default:
      return 'draft';
  }
}

export function CrossBorderTransfer(): ReactElement {
  const {
    orgIdParam,
    selectedOrgId,
    hasOrg,
    canEdit,
  } = useComplianceOrg();

  // Core Lists & Data
  const [transfers, setTransfers] = useState<CbtTransfer[]>([]);
  const [contracts, setContracts] = useState<Record<string, CbtContract[]>>({});
  const [sdfAssessments, setSdfAssessments] = useState<Record<string, CbtSdfAssessment[]>>({});
  const [activities, setActivities] = useState<CbtActivity[]>([]);
  const [dpias, setDpias] = useState<DPIARecord[]>([]);
  const [processors, setProcessors] = useState<DataProcessor[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [dashboard, setDashboard] = useState<CbtDashboardKpis | null>(null);

  // States
  const [activeTab, setActiveTab] = useState<TabId>('transfers');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Modals & Selections
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<CbtTransfer | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<CbtContractDetail | null>(null);
  const [showSdfModal, setShowSdfModal] = useState(false);

  const [transferForm, setTransferForm] = useState({
    name: '',
    destination_country: '',
    country_code: '',
    destination_entity: '',
    data_processor_id: '',
    transfer_purpose: '',
    legal_basis: 'contract',
    adequacy_status: 'unknown',
    safeguard_mechanism: '',
    status: 'draft' as any,
    dpia_required: false,
    dpia_completed: false,
    next_review_date: '',
    dpia_id: '',
  });

  // Form states for Contract
  const [contractForm, setContractForm] = useState({
    title: '',
    content: '',
    summary: '',
  });

  // Form states for SDF Assessment
  const [sdfForm, setSdfForm] = useState({
    assessor_name: '',
    risk_level: 'medium',
    findings: '',
    mitigation_measures: '',
  });

  const isSdfOrg = workspace?.is_significant_data_fiduciary || false;

  const loadAllData = async () => {
    if (!hasOrg) return;
    setLoading(true);
    try {
      const [transRes, dashRes, workRes, actRes, dpiaRes] = await Promise.all([
        fetchCbtTransfers(orgIdParam),
        fetchCbtDashboard(orgIdParam),
        fetchWorkspace(orgIdParam),
        fetchCbtActivities(orgIdParam),
        fetchDPIAs(undefined, undefined, orgIdParam),
      ]);

      setTransfers(transRes);
      setDashboard(dashRes);
      setWorkspace(workRes);
      setProcessors(workRes.processors || []);
      setActivities(actRes);
      setDpias(dpiaRes || []);

      // Load contracts and assessments per transfer
      const contractsMap: Record<string, CbtContract[]> = {};
      const sdfMap: Record<string, CbtSdfAssessment[]> = {};
      
      await Promise.all(
        transRes.map(async (t) => {
          try {
            const [cRes, sRes] = await Promise.all([
              fetchCbtContracts(t.id, orgIdParam),
              fetchCbtSdfAssessments(t.id, orgIdParam),
            ]);
            contractsMap[t.id] = cRes;
            sdfMap[t.id] = sRes;
          } catch (e) {
            // ignore partial load errors
          }
        })
      );
      setContracts(contractsMap);
      setSdfAssessments(sdfMap);
    } catch (err: any) {
      notify(err.message || 'Failed to load cross-border transfer data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
  }, [selectedOrgId, hasOrg]);

  const handleOpenTransferModal = (t: CbtTransfer | null = null) => {
    setSelectedTransfer(t);
    if (t) {
      setTransferForm({
        name: t.name,
        destination_country: t.destination_country,
        country_code: t.country_code,
        destination_entity: t.destination_entity,
        data_processor_id: t.data_processor_id || '',
        transfer_purpose: t.transfer_purpose || '',
        legal_basis: t.legal_basis,
        adequacy_status: t.adequacy_status,
        safeguard_mechanism: t.safeguard_mechanism || '',
        status: t.status,
        dpia_required: t.dpia_required,
        dpia_completed: !!t.dpia_completed_at,
        next_review_date: t.next_review_date ? t.next_review_date.substring(0, 10) : '',
        dpia_id: t.dpia_id || '',
      });
      setCountrySearch(t.destination_country);
    } else {
      setTransferForm({
        name: '',
        destination_country: '',
        country_code: '',
        destination_entity: '',
        data_processor_id: '',
        transfer_purpose: '',
        legal_basis: 'contract',
        adequacy_status: 'unknown',
        safeguard_mechanism: '',
        status: 'draft',
        dpia_required: isSdfOrg,
        dpia_completed: false,
        next_review_date: '',
        dpia_id: '',
      });
      setCountrySearch('');
    }
    setShowTransferModal(true);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: transferForm.name,
        destination_country: transferForm.destination_country,
        country_code: transferForm.country_code,
        destination_entity: transferForm.destination_entity,
        data_processor_id: transferForm.data_processor_id || null,
        transfer_purpose: transferForm.transfer_purpose || null,
        legal_basis: transferForm.legal_basis,
        adequacy_status: transferForm.adequacy_status,
        safeguard_mechanism: transferForm.safeguard_mechanism || null,
        status: transferForm.status,
        dpia_required: transferForm.dpia_required,
        dpia_completed_at: transferForm.dpia_completed ? new Date().toISOString() : null,
        next_review_date: transferForm.next_review_date || null,
        dpia_id: transferForm.dpia_id || null,
      };

      if (selectedTransfer) {
        await updateCbtTransfer(selectedTransfer.id, payload, orgIdParam);
        notify('Transfer updated successfully');
      } else {
        await createCbtTransfer(payload, orgIdParam);
        notify('Transfer registered successfully');
      }
      setShowTransferModal(false);
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to save transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this cross-border transfer registry?')) return;
    try {
      await deleteCbtTransfer(id, orgIdParam);
      notify('Transfer deleted successfully');
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to delete transfer');
    }
  };

  const handleOpenContractModal = async (t: CbtTransfer) => {
    setSelectedTransfer(t);
    setContractForm({ title: `DPA - ${t.destination_entity}`, content: '', summary: '' });
    setShowContractModal(true);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    setSubmitting(true);
    try {
      await createCbtContract(selectedTransfer.id, contractForm, orgIdParam);
      notify('Contract drafted successfully');
      setShowContractModal(false);
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to save contract');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewContractDetail = async (contractId: string) => {
    try {
      const detail = await fetchCbtContract(contractId, orgIdParam);
      setSelectedContract(detail);
    } catch (err: any) {
      notify('Failed to retrieve contract versions');
    }
  };

  const handleSignContract = async (cId: string, vId: string) => {
    try {
      await signCbtContract(cId, vId, orgIdParam);
      notify('Contract signed successfully');
      if (selectedContract && selectedContract.id === cId) {
        void handleViewContractDetail(cId);
      }
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to sign contract');
    }
  };

  const handleDownloadPdf = async (cId: string, vId: string, title: string) => {
    try {
      const blob = await downloadContractPdf(cId, vId, orgIdParam);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notify('Failed to download contract PDF');
    }
  };

  const handleTriggerNotice = async (t: CbtTransfer) => {
    if (!confirm(`Trigger notice delivery campaign to notify data principals about the cross-border transfer: "${t.name}"?`)) return;
    try {
      await triggerCbtNoticeCampaign(t.id, orgIdParam);
      notify('Notice campaign dispatched successfully via Notice Campaigns');
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to trigger notice campaign');
    }
  };

  const handleOpenSdfModal = (t: CbtTransfer) => {
    setSelectedTransfer(t);
    setSdfForm({ assessor_name: '', risk_level: 'medium', findings: '', mitigation_measures: '' });
    setShowSdfModal(true);
  };

  const handleSaveSdfAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;
    setSubmitting(true);
    try {
      await createCbtSdfAssessment(selectedTransfer.id, sdfForm, orgIdParam);
      notify('SDF compliance audit assessment submitted successfully');
      setShowSdfModal(false);
      void loadAllData();
    } catch (err: any) {
      notify(err.message || 'Failed to save SDF assessment');
    } finally {
      setSubmitting(false);
    }
  };

  const {
    page: transfersPage,
    setPage: setTransfersPage,
    pageCount: transfersPageCount,
    pageItems: transfersPageItems,
    total: transfersTotal,
    pageSize: transfersPageSize,
  } = useClientPagination(transfers, TABLE_PAGE_SIZE, transfers.length);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="size-8 text-indigo-600 animate-spin" />
        <span className="text-sm text-[var(--text-secondary)]">Loading cross-border transfer compliance...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-[var(--text-primary)]">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-default)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Cross-Border Data Transfer Registry
            </h1>
            <DPDPAChip
              sections={{
                chapter: 2,
                section: 16,
                name: 'Transfer of personal data outside India',
                url: '/dpdpa2023/chapter-2/section16.html',
                excerpt: 'A Data Fiduciary may transfer personal data to any country outside India...',
              }}
            />
            {isSdfOrg && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200">
                SDF Mode Active
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Section 16 negative-list transfer auditing, contractual DPA signing, and Data Principal notifications.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => handleOpenTransferModal(null)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg shadow-sm transition"
          >
            <Plus className="size-4" />
            Register Transfer
          </button>
        )}
      </div>

      {/* SDF Alert Banner */}
      {isSdfOrg && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-indigo-50/50 border border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900">
          <AlertTriangle className="size-5 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 text-sm">Significant Data Fiduciary Enhanced Obligations</h4>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-400/80 mt-0.5">
              Under DPDPA, your organization must perform mandatory independent transfer audits (DPIAs) and maintain comprehensive contractual provisions for all offshore transfers.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5">
            <div className="text-xs text-[var(--text-secondary)]">Registered Transfers</div>
            <div className="text-2xl font-semibold mt-1">{dashboard.total_transfers}</div>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5">
            <div className="text-xs text-[var(--text-secondary)]">Active Transfers</div>
            <div className="text-2xl font-semibold text-green-600 dark:text-green-400 mt-1">
              {dashboard.active_transfers}
            </div>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5">
            <div className="text-xs text-[var(--text-secondary)]">Signed DPA Contracts</div>
            <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
              {dashboard.signed_contracts}
            </div>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5">
            <div className="text-xs text-[var(--text-secondary)]">Pending SDF DPIAs</div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400 mt-1">
              {dashboard.pending_sdf_assessments}
            </div>
          </div>
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5">
            <div className="text-xs text-[var(--text-secondary)]">Restricted Countries Alerts</div>
            <div className="text-2xl font-semibold text-red-600 dark:text-red-400 mt-1">
              {dashboard.restricted_countries_alert_count}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-default)]">
        {(['transfers', 'contracts', 'notices', 'sdf', 'audit'] as TabId[]).map((tab) => {
          if (tab === 'sdf' && !isSdfOrg) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'transfers' && 'Transfers Registry'}
              {tab === 'contracts' && 'DPA Contracts'}
              {tab === 'notices' && 'Notice Dispatches'}
              {tab === 'sdf' && 'SDF Compliance'}
              {tab === 'audit' && 'Activity Log'}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {activeTab === 'transfers' && (
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] overflow-hidden">
            <table className="min-w-full divide-y divide-[var(--border-default)] text-sm">
              <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Transfer Name</th>
                  <th className="px-6 py-3 text-left font-medium">Destination Entity</th>
                  <th className="px-6 py-3 text-left font-medium">Destination Country</th>
                  <th className="px-6 py-3 text-left font-medium">Legal Basis</th>
                  <th className="px-6 py-3 text-left font-medium">SDF Audited</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 right text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No cross-border transfers registered. Click "Register Transfer" to add one.
                    </td>
                  </tr>
                ) : (
                  transfersPageItems.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--surface-raised)]/30">
                      <td className="px-6 py-4 font-medium text-[var(--text-primary)]">{t.name}</td>
                      <td className="px-6 py-4">{t.destination_entity}</td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5">
                          <Globe className="size-4 text-indigo-500" />
                          {t.destination_country} ({t.country_code})
                        </span>
                      </td>
                      <td className="px-6 py-4 capitalize">{t.legal_basis}</td>
                      <td className="px-6 py-4">
                        {t.dpia_required ? (
                          <div className="flex flex-col">
                            {t.dpia_completed_at ? (
                              <span className="text-green-600 font-medium">Completed</span>
                            ) : (
                              <span className="text-amber-600 font-medium">Pending</span>
                            )}
                            {t.dpia_id && (
                              <span className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                Link: {dpias.find(d => d.id === t.dpia_id)?.dpia_ref || 'DPIA Case'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-[var(--text-secondary)]">Not Required</span>
                            {t.dpia_id && (
                              <span className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                Link: {dpias.find(d => d.id === t.dpia_id)?.dpia_ref || 'DPIA Case'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill status={mapStatus(t.status)} />
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenTransferModal(t)}
                          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Edit
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteTransfer(t.id)}
                            className="text-xs text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <TablePager
              page={transfersPage}
              pageCount={transfersPageCount}
              total={transfersTotal}
              pageSize={transfersPageSize}
              onPage={setTransfersPage}
            />
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-5 space-y-4">
              <h3 className="font-semibold text-base">Select Transfer to Manage DPA</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Draft and audit statutory cross-border Data Processing Agreements (DPA) required under DPDPA Section 8.
              </p>
              <div className="space-y-2">
                {transfers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTransfer(t);
                      setSelectedContract(null);
                      const cList = contracts[t.id] || [];
                      if (cList[0]) {
                        void handleViewContractDetail(cList[0].id);
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition text-sm flex justify-between items-center ${
                      selectedTransfer?.id === t.id
                        ? 'border-indigo-600 bg-indigo-50/20 dark:border-indigo-400'
                        : 'border-[var(--border-default)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {t.destination_entity} &middot; {t.destination_country}
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200">
                      {(contracts[t.id] || []).length} DPA
                    </span>
                  </button>
                ))}
              </div>

              {selectedTransfer && (contracts[selectedTransfer.id] || []).length === 0 && canEdit && (
                <button
                  onClick={() => handleOpenContractModal(selectedTransfer)}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-indigo-500 text-indigo-600 hover:bg-indigo-50/10 rounded-lg text-sm transition"
                >
                  <Plus className="size-4" />
                  Draft DPA Contract
                </button>
              )}
            </div>

            <div className="lg:col-span-2 space-y-6">
              {selectedContract ? (
                <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4">
                    <div>
                      <h2 className="text-lg font-bold">{selectedContract.title}</h2>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        DPA Contract Reference: {selectedContract.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill status={mapStatus(selectedContract.status)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm">Contract Version History</h3>
                    <div className="space-y-3">
                      {selectedContract.versions.map((v) => (
                        <div
                          key={v.id}
                          className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">Version {v.version_number}</span>
                              <StatusPill status={mapStatus(v.status)} />
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                              Created: {new Date(v.created_at).toLocaleString()}
                            </p>
                            {v.summary && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1.5 italic">
                                Summary: {v.summary}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 self-end md:self-auto">
                            <button
                              onClick={() => handleDownloadPdf(selectedContract.id, v.id, selectedContract.title)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-white dark:bg-slate-800 border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                            >
                              <Download className="size-3.5" />
                              PDF Contract
                            </button>

                            {v.status === 'draft' && canEdit && (
                              <button
                                onClick={() => handleSignContract(selectedContract.id, v.id)}
                                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                              >
                                <Send className="size-3.5" />
                                Execute & Sign
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-8 text-center text-[var(--text-secondary)]">
                  Select a transfer registry from the left panel to manage Data Processing agreements.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'notices' && (
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 space-y-6">
            <div>
              <h3 className="font-semibold text-base">Disclosure Notice Dispatches</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                DPDPA Sections 5 and 7 mandate that organizations notify Data Principals of third-party disclosures, including offshore transfers. Check transfer campaigns below.
              </p>
            </div>

            <div className="divide-y divide-[var(--border-default)]">
              {transfers.length === 0 ? (
                <div className="py-6 text-center text-[var(--text-secondary)]">
                  No registered transfers to schedule notice campaigns for.
                </div>
              ) : (
                transfers.map((t) => (
                  <div key={t.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Offshore Destination: {t.destination_entity} ({t.destination_country})
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => handleTriggerNotice(t)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition"
                      >
                        <Send className="size-3.5" />
                        Trigger Notice Campaign
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'sdf' && isSdfOrg && (
          <div className="space-y-6">
            <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-base">SDF Compliance Audits & assessments</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Periodic Data Protection Impact Assessments (DPIA) and independent audits for cross-border flows.
                </p>
              </div>

              <div className="space-y-4">
                {transfers.map((t) => {
                  const assessments = sdfAssessments[t.id] || [];
                  return (
                    <div key={t.id} className="p-4 rounded-lg border border-[var(--border-default)] space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm">{t.name}</span>
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Destination: {t.destination_entity} ({t.destination_country})
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleOpenSdfModal(t)}
                            className="px-2.5 py-1.5 border border-indigo-600 text-indigo-600 rounded text-xs font-semibold hover:bg-indigo-50/10 transition"
                          >
                            New Assessment
                          </button>
                        )}
                      </div>

                      {assessments.length === 0 ? (
                        <div className="text-xs text-[var(--text-secondary)] italic">
                          No audit assessments logged for this transfer yet.
                        </div>
                      ) : (
                        <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
                          {assessments.map((a) => (
                            <div key={a.id} className="text-xs p-3 rounded bg-slate-50 dark:bg-slate-900 border border-[var(--border-default)]/50">
                              <div className="flex justify-between items-center font-medium">
                                <span>Assessor: {a.assessor_name} ({a.risk_level.toUpperCase()} Risk)</span>
                                <span>{new Date(a.assessment_date).toLocaleDateString()}</span>
                              </div>
                              <p className="mt-1 text-[var(--text-secondary)]"><b>Findings:</b> {a.findings}</p>
                              {a.mitigation_measures && (
                                <p className="mt-1 text-[var(--text-secondary)]"><b>Mitigations:</b> {a.mitigation_measures}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 space-y-6">
            <h3 className="font-semibold text-base">Cross-Border Activity Log</h3>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] text-center py-6">
                  No cross-border activities logged.
                </p>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 border-l-4 border-indigo-600 bg-[var(--surface-raised)]/20 rounded-r-md text-xs flex justify-between items-start gap-4"
                  >
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {act.action.replace('_', ' ').toUpperCase()}
                      </div>
                      <div className="text-[var(--text-secondary)] mt-0.5">
                        <b>Transfer:</b> {act.transfer_name} &middot; <b>User:</b> {act.user_name}
                      </div>
                      {act.details && (
                        <pre className="mt-2 text-[10px] p-2 rounded bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-x-auto">
                          {JSON.stringify(act.details, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="text-[var(--text-secondary)] shrink-0">
                      {new Date(act.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Register Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
              <h3 className="text-base font-semibold">
                {selectedTransfer ? 'Edit Registered Transfer' : 'Register Cross-Border Transfer'}
              </h3>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Transfer Registry Name *
                </label>
                <input
                  type="text"
                  required
                  value={transferForm.name}
                  onChange={(e) => setTransferForm({ ...transferForm, name: e.target.value })}
                  placeholder="e.g. Analytics Data offshore transfer"
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Offshore Entity *
                  </label>
                  <input
                    type="text"
                    required
                    value={transferForm.destination_entity}
                    onChange={(e) => setTransferForm({ ...transferForm, destination_entity: e.target.value })}
                    placeholder="e.g. Acme Corp Inc"
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Associated Processor
                  </label>
                  <select
                    value={transferForm.data_processor_id}
                    onChange={(e) => setTransferForm({ ...transferForm, data_processor_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- None --</option>
                    {processors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Destination Country *
                  </label>
                  <input
                    type="text"
                    required
                    value={transferForm.destination_country}
                    onFocus={() => setShowCountryDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCountryDropdown(false), 200)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransferForm(prev => ({ ...prev, destination_country: val }));
                      setCountrySearch(val);
                      // Try auto-matching code on type
                      const match = COUNTRIES_LIST.find(
                        c => c.name.toLowerCase() === val.trim().toLowerCase()
                      );
                      if (match) {
                        setTransferForm(prev => ({
                          ...prev,
                          destination_country: match.name,
                          country_code: match.code,
                        }));
                      }
                    }}
                    placeholder="Search destination country..."
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                    autoComplete="off"
                  />
                  {showCountryDropdown && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] shadow-lg">
                      {COUNTRIES_LIST.filter(
                        c =>
                          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                          c.code.toLowerCase().includes(countrySearch.toLowerCase())
                      ).map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onMouseDown={() => {
                            setTransferForm(prev => ({
                              ...prev,
                              destination_country: c.name,
                              country_code: c.code,
                            }));
                            setCountrySearch(c.name);
                            setShowCountryDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-raised)] transition text-[var(--text-primary)]"
                        >
                          <span className="font-medium">{c.name}</span>{' '}
                          <span className="text-xs text-[var(--text-secondary)]">({c.code})</span>
                        </button>
                      ))}
                      {COUNTRIES_LIST.filter(
                        c =>
                          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                          c.code.toLowerCase().includes(countrySearch.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-2 text-xs text-[var(--text-secondary)] italic">
                          No matching country found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Country Code (ISO) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    value={transferForm.country_code}
                    onChange={(e) => setTransferForm(prev => ({ ...prev, country_code: e.target.value }))}
                    placeholder="e.g. USA"
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Purpose of Transfer
                </label>
                <textarea
                  value={transferForm.transfer_purpose}
                  onChange={(e) => setTransferForm({ ...transferForm, transfer_purpose: e.target.value })}
                  placeholder="Describe why this personal data is processed offshore"
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500 h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Legal Basis
                  </label>
                  <input
                    type="text"
                    value={transferForm.legal_basis}
                    onChange={(e) => setTransferForm({ ...transferForm, legal_basis: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Adequacy Mechanism
                  </label>
                  <input
                    type="text"
                    value={transferForm.adequacy_status}
                    onChange={(e) => setTransferForm({ ...transferForm, adequacy_status: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Safeguards and Security Measures
                </label>
                <input
                  type="text"
                  value={transferForm.safeguard_mechanism}
                  onChange={(e) => setTransferForm({ ...transferForm, safeguard_mechanism: e.target.value })}
                  placeholder="e.g. Standard Contractual Clauses executed"
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Status
                  </label>
                  <select
                    value={transferForm.status}
                    onChange={(e) => setTransferForm({ ...transferForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Next Review Audit Date
                  </label>
                  <input
                    type="date"
                    value={transferForm.next_review_date}
                    onChange={(e) => setTransferForm({ ...transferForm, next_review_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={transferForm.dpia_required}
                    onChange={(e) => setTransferForm({ ...transferForm, dpia_required: e.target.checked })}
                    className="rounded border-[var(--border-default)] text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>DPIA / Assessment Required</span>
                </label>

                {transferForm.dpia_required && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={transferForm.dpia_completed}
                      onChange={(e) => setTransferForm({ ...transferForm, dpia_completed: e.target.checked })}
                      className="rounded border-[var(--border-default)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Audit Completed</span>
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Associated DPIA Case File
                </label>
                <select
                  value={transferForm.dpia_id}
                  onChange={(e) => setTransferForm({ ...transferForm, dpia_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- None / Select DPIA --</option>
                  {dpias.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dpia_ref} — {d.title} ({d.status})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Links this cross-border transfer directly with the Data Protection Impact Assessment (DPIA) module.
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded text-xs font-semibold hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-2"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Template Creation Modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
              <h3 className="text-base font-semibold">Draft Data Processing Contract</h3>
              <button
                onClick={() => setShowContractModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Contract Title *
                </label>
                <input
                  type="text"
                  required
                  value={contractForm.title}
                  onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Execution Summary
                </label>
                <input
                  type="text"
                  value={contractForm.summary}
                  onChange={(e) => setContractForm({ ...contractForm, summary: e.target.value })}
                  placeholder="e.g. Standard DPA for offshore vendor operations"
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowContractModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded text-xs font-semibold hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-2"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  Generate DPA Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SDF Assessment Creation Modal */}
      {showSdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
              <h3 className="text-base font-semibold">Independent SDF Audit Assessment</h3>
              <button
                onClick={() => setShowSdfModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSdfAssessment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Auditor/Assessor Name *
                </label>
                <input
                  type="text"
                  required
                  value={sdfForm.assessor_name}
                  onChange={(e) => setSdfForm({ ...sdfForm, assessor_name: e.target.value })}
                  placeholder="e.g. Independent Data Auditor / DPO"
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Risk Level
                </label>
                <select
                  value={sdfForm.risk_level}
                  onChange={(e) => setSdfForm({ ...sdfForm, risk_level: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none"
                >
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                  <option value="critical">Critical Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Audit Findings
                </label>
                <textarea
                  value={sdfForm.findings}
                  onChange={(e) => setSdfForm({ ...sdfForm, findings: e.target.value })}
                  placeholder="Detail the audit findings and structural data flow observations."
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none h-20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Mitigation Measures
                </label>
                <textarea
                  value={sdfForm.mitigation_measures}
                  onChange={(e) => setSdfForm({ ...sdfForm, mitigation_measures: e.target.value })}
                  placeholder="Define mitigating security/safeguard actions implemented."
                  className="w-full px-3 py-2 text-sm rounded border border-[var(--border-default)] bg-[var(--surface-raised)]/30 focus:outline-none h-20"
                />
              </div>

              <div className="pt-4 border-t border-[var(--border-default)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSdfModal(false)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded text-xs font-semibold hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-2"
                >
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  Submit Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
