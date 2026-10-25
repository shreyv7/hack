import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listOrganizations } from '@/lib/api/admin';
import * as policyApi from '@/lib/api/policy';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit as userCanEdit } from '@/lib/auth/permissions';
import { notify } from '@/app/utils/notify';
import type { Organization } from '@/types/organization';
import type {
  PolicyStats,
  PolicySummary,
  PolicyDetail,
  PolicyVersion,
  AcknowledgementSummary,
  PolicyActivity,
  PolicyGenerateFromRopaResult,
  PolicyType,
} from '@/types/policy';

const POLICY_ORG_STORAGE_KEY = 'policy_org_id';

function readStoredOrgId(): string {
  try {
    return sessionStorage.getItem(POLICY_ORG_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function usePolicyManagement() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string>(() =>
    isSuperadmin ? readStoredOrgId() : ''
  );
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<AcknowledgementSummary[]>([]);
  const [activities, setActivities] = useState<PolicyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const effectiveOrgId = isSuperadmin ? selectedOrgId : (user?.organization_id ?? '');
  const hasOrg = Boolean(effectiveOrgId);
  const canEdit =
    userCanEdit(user) && (user?.role === 'admin' || user?.role === 'superadmin');
  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    try {
      if (id) sessionStorage.setItem(POLICY_ORG_STORAGE_KEY, id);
      else sessionStorage.removeItem(POLICY_ORG_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isSuperadmin) return;
    let cancelled = false;
    void listOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        setOrganizations(orgs);
        const stored = readStoredOrgId();
        const validStored = stored && orgs.some((o) => o.id === stored);
        if (validStored) setSelectedOrgIdState(stored);
        else if (orgs[0]) setSelectedOrgId(orgs[0].id);
      })
      .catch(() => {
        if (!cancelled) setOrganizations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin]);

  const load = useCallback(async () => {
    if (!hasOrg) {
      setPolicies([]);
      setStats(null);
      setAcknowledgements([]);
      setActivities([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [polList, statsData, ackList, actList] = await Promise.all([
        policyApi.fetchPolicies(orgIdParam, showArchived),
        policyApi.fetchPolicyStats(orgIdParam),
        policyApi.fetchAcknowledgements(orgIdParam),
        policyApi.fetchPolicyActivities(orgIdParam),
      ]);
      setPolicies(polList);
      setStats(statsData);
      setAcknowledgements(ackList);
      setActivities(actList);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load policy management data';
      setError(msg);
      setPolicies([]);
      setStats(null);
      setAcknowledgements([]);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPolicy = async (body: {
    title: string;
    policy_type: string;
    content?: string;
    summary?: string;
  }): Promise<PolicyDetail> => {
    try {
      const detail = await policyApi.createPolicy(body, orgIdParam);
      notify(`Policy '${body.title}' created successfully.`);
      await load();
      return detail;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create policy';
      notify(msg);
      throw e;
    }
  };

  const updatePolicy = async (
    id: string,
    body: { title?: string; policy_type?: string }
  ): Promise<PolicyDetail> => {
    try {
      const detail = await policyApi.updatePolicy(id, body, orgIdParam);
      notify('Policy settings updated.');
      await load();
      return detail;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to update policy settings';
      notify(msg);
      throw e;
    }
  };

  const archivePolicy = async (id: string): Promise<PolicyDetail> => {
    try {
      const detail = await policyApi.archivePolicy(id, orgIdParam);
      notify('Policy archived.');
      await load();
      return detail;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to archive policy';
      notify(msg);
      throw e;
    }
  };

  const restorePolicy = async (id: string): Promise<PolicyDetail> => {
    try {
      const detail = await policyApi.unarchivePolicy(id, orgIdParam);
      notify('Policy restored.');
      await load();
      return detail;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to restore policy';
      notify(msg);
      throw e;
    }
  };

  const getPolicyDetail = useCallback(
    (id: string): Promise<PolicyDetail> => policyApi.fetchPolicy(id, orgIdParam),
    [orgIdParam]
  );

  const createVersion = async (
    policyId: string,
    body: { content: string; summary?: string; effective_date?: string }
  ): Promise<PolicyVersion> => {
    try {
      const version = await policyApi.createPolicyVersion(policyId, body, orgIdParam);
      notify('New draft version created.');
      await load();
      return version;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create draft version';
      notify(msg);
      throw e;
    }
  };

  const updateVersion = async (
    policyId: string,
    versionId: string,
    body: { content?: string; summary?: string; effective_date?: string }
  ): Promise<PolicyVersion> => {
    try {
      const version = await policyApi.updatePolicyVersion(policyId, versionId, body, orgIdParam);
      notify('Draft version updated.');
      await load();
      return version;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to update draft version';
      notify(msg);
      throw e;
    }
  };

  const submitVersionForReview = async (
    policyId: string,
    versionId: string
  ): Promise<PolicyVersion> => {
    try {
      const version = await policyApi.submitForReview(policyId, versionId, orgIdParam);
      notify('Version submitted for review.');
      await load();
      return version;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to submit version for review';
      notify(msg);
      throw e;
    }
  };

  const approvePolicyVersion = async (
    policyId: string,
    versionId: string
  ): Promise<PolicyVersion> => {
    try {
      const version = await policyApi.approveVersion(policyId, versionId, orgIdParam);
      notify('Version approved.');
      await load();
      return version;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to approve version';
      notify(msg);
      throw e;
    }
  };

  const publishPolicyVersion = async (
    policyId: string,
    versionId: string
  ): Promise<PolicyVersion> => {
    try {
      const version = await policyApi.publishVersion(policyId, versionId, orgIdParam);
      notify('Version published live successfully.');
      await load();
      return version;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to publish version';
      notify(msg);
      throw e;
    }
  };

  const sendReminderEmails = async (policyId: string, versionId?: string, channel?: string) => {
    try {
      const res = await policyApi.sendReminder(policyId, versionId, channel, orgIdParam);
      notify(`Sent ${res.sent_count} reminders for ${res.policy_title} (${res.version}).`);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to send reminders';
      notify(msg);
      throw e;
    }
  };

  const generateFromRopa = async (
    policyType: PolicyType = 'privacy'
  ): Promise<PolicyGenerateFromRopaResult> => {
    try {
      const result = await policyApi.generatePolicyFromRopa(policyType, orgIdParam);
      const sourceLabel =
        result.source === 'bedrock' || result.source === 'vertex'
          ? 'Shield AI'
          : 'rule-based engine';
      notify(
        result.is_new_policy
          ? `Draft policy created from RoPA via ${sourceLabel}.`
          : `New draft version added from RoPA via ${sourceLabel}.`
      );
      await load();
      return result;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate policy from RoPA';
      notify(msg);
      throw e;
    }
  };

  const organizationName = useMemo(() => {
    const match = organizations.find((org) => org.id === effectiveOrgId);
    return match?.name ?? 'Organization';
  }, [organizations, effectiveOrgId]);

  return {
    policies,
    stats,
    acknowledgements,
    activities,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    reload: load,
    createPolicy,
    updatePolicy,
    archivePolicy,
    restorePolicy,
    getPolicyDetail,
    createVersion,
    updateVersion,
    submitVersionForReview,
    approvePolicyVersion,
    publishPolicyVersion,
    sendReminderEmails,
    generateFromRopa,
    showArchived,
    setShowArchived,
    organizationName,
  };
}
