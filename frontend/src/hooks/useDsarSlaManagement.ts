import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listOrganizations } from '@/lib/api/admin';
import * as dsarApi from '@/lib/api/dsar';
import { listUsers } from '@/lib/api/users';
import {
  canAssignDsar,
  canEdit,
  canLegalDraft,
  canLegalSignoff,
  hasPermission,
} from '@/lib/auth/permissions';
import { useAuth } from '@/contexts/AuthContext';
import type { User, UserRole } from '@/types/auth';
import type { Organization } from '@/types/organization';
import type { DataRightType, DataRightsRequestStatus, DsarDashboard } from '@/types/dsar';

const DSAR_ORG_STORAGE_KEY = 'dsar_org_id';
const ASSIGNEE_ROLES: UserRole[] = [
  'user',
  'admin',
  'grievance_officer',
  'legal_counsel',
  'legal_head',
  'compliance_officer',
];

function readStoredOrgId(): string {
  try {
    return sessionStorage.getItem(DSAR_ORG_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

async function loadAssigneePool(orgIdParam?: string): Promise<User[]> {
  const lists = await Promise.all(
    ASSIGNEE_ROLES.map((role) =>
      listUsers(orgIdParam, role).catch(() => [] as User[])
    )
  );
  const byId = new Map<string, User>();
  for (const users of lists) {
    for (const u of users) {
      byId.set(u.id, u);
    }
  }
  return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function useDsarSlaManagement() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string>(() =>
    isSuperadmin ? readStoredOrgId() : ''
  );
  const [dashboard, setDashboard] = useState<DsarDashboard | null>(null);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrgId = isSuperadmin ? selectedOrgId : (user?.organization_id ?? '');
  const hasOrg = Boolean(effectiveOrgId);
  const isOrgAdmin = user?.role === 'admin';
  const isAdmin =
    isOrgAdmin ||
    isSuperadmin ||
    hasPermission(user, 'dsar.assign') ||
    hasPermission(user, 'grievance.manage');
  const canEditDsar =
    canEdit(user) &&
    (hasPermission(user, 'dsar.write') ||
      hasPermission(user, 'grievance.manage') ||
      hasPermission(user, 'dsar.assign'));
  const canAssign = canAssignDsar(user) || hasPermission(user, 'grievance.manage');
  const canRequestLegal = canLegalDraft(user);
  const canSignLegal = canLegalSignoff(user);
  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    try {
      if (id) sessionStorage.setItem(DSAR_ORG_STORAGE_KEY, id);
      else sessionStorage.removeItem(DSAR_ORG_STORAGE_KEY);
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

  const load = useCallback(
    async (
      filters?: { status?: DataRightsRequestStatus; right_type?: DataRightType },
      options?: { silent?: boolean }
    ) => {
      if (!hasOrg) {
        setDashboard(null);
        setLoading(false);
        setError(null);
        return;
      }
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await dsarApi.fetchDsarDashboard(orgIdParam, filters);
        setDashboard(data);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Failed to load DSAR data';
        setError(msg);
        if (!options?.silent) {
          setDashboard(null);
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [hasOrg, orgIdParam]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasOrg) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    void loadAssigneePool(orgIdParam)
      .then((users) => {
        if (!cancelled) setTeamMembers(users);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasOrg, orgIdParam]);

  const updateRequest = async (
    requestId: string,
    body: {
      status?: DataRightsRequestStatus;
      assigned_to_user_id?: string | null;
      acknowledge_grievance?: boolean;
      requires_legal_signoff?: boolean;
    }
  ) => {
    const updated = await dsarApi.updateDsarRequest(requestId, body, orgIdParam);
    await load();
    return updated;
  };

  const batchUpdateRequests = async (body: {
    request_ids: string[];
    assigned_to_user_id?: string | null;
    status?: DataRightsRequestStatus;
    advance_status?: boolean;
  }) => {
    const result = await dsarApi.batchUpdateDsarRequests(body, orgIdParam);
    await load(undefined, { silent: true });
    return result;
  };

  const legalSignoffRequest = async (requestId: string) => {
    const updated = await dsarApi.legalSignoffDsarRequest(requestId, orgIdParam);
    await load();
    return updated;
  };

  const resolveRequest = async (requestId: string, closureNotes?: string) => {
    const updated = await dsarApi.resolveDsarRequest(requestId, closureNotes, orgIdParam);
    await load();
    return updated;
  };

  const runSlaEngine = () => dsarApi.runSlaEngineOnce().then(() => load());

  const canHandleRequest = (request: {
    assigned_to_user_id: string | null;
    status: string;
    right_type?: string;
  }) => {
    if (isSuperadmin) return true;
    if (isOrgAdmin) {
      return (
        request.assigned_to_user_id === null || request.assigned_to_user_id === user?.id
      );
    }
    if (user?.role === 'grievance_officer' && request.right_type === 'grievance') {
      return true;
    }
    if (hasPermission(user, 'dsar.legal_draft') && request.status === 'response_ready') {
      return true;
    }
    if (user?.role !== 'user') return false;
    return (
      request.assigned_to_user_id === user.id &&
      (request.status === 'in_review' || request.status === 'response_ready')
    );
  };

  return {
    dashboard,
    loading,
    error,
    hasOrg,
    canEdit: canEditDsar,
    canAssign,
    canRequestLegal,
    canSignLegal,
    isAdmin,
    isOrgAdmin,
    canHandleRequest,
    isSuperadmin,
    organizations,
    teamMembers,
    selectedOrgId,
    setSelectedOrgId,
    reload: load,
    updateRequest,
    batchUpdateRequests,
    legalSignoffRequest,
    resolveRequest,
    runSlaEngine,
  };
}
