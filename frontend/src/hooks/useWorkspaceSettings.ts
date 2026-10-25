import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listOrganizations } from '@/lib/api/admin';
import * as workspaceApi from '@/lib/api/workspace';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit as userCanEdit, hasPermission } from '@/lib/auth/permissions';
import type { Organization } from '@/types/organization';
import { downloadEvidencePack, downloadFullEvidencePack, type EvidencePackSection } from '@/lib/workspace/evidencePack';
import { notify } from '@/app/utils/notify';
import type {
  DataProcessor,
  DataProcessorCreate,
  DataProcessorUpdate,
  DpdpObligation,
  WorkspaceDeploymentUpdate,
  WorkspaceIndustryUpdate,
  WorkspaceProfileUpdate,
  WorkspaceRoleMappingUpdate,
  WorkspaceSettings,
} from '@/types/workspace';

const WORKSPACE_ORG_STORAGE_KEY = 'workspace_org_id';

function readStoredOrgId(): string {
  try {
    return sessionStorage.getItem(WORKSPACE_ORG_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useWorkspaceSettings() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string>(() =>
    isSuperadmin ? readStoredOrgId() : ''
  );
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [obligations, setObligations] = useState<DpdpObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrgId = isSuperadmin ? selectedOrgId : (user?.organization_id ?? '');
  const hasOrg = Boolean(effectiveOrgId);
  const canEdit =
    userCanEdit(user) &&
    (hasPermission(user, 'workspace.manage') || user?.role === 'admin' || user?.role === 'superadmin');
  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    try {
      if (id) sessionStorage.setItem(WORKSPACE_ORG_STORAGE_KEY, id);
      else sessionStorage.removeItem(WORKSPACE_ORG_STORAGE_KEY);
    } catch {
      // ignore storage errors
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
        if (validStored) {
          setSelectedOrgIdState(stored);
        } else if (orgs[0]) {
          setSelectedOrgId(orgs[0].id);
        }
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
      setSettings(null);
      setObligations([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ws, obs] = await Promise.all([
        workspaceApi.fetchWorkspace(orgIdParam),
        workspaceApi.fetchObligations(),
      ]);
      setSettings(ws);
      setObligations(obs);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load workspace settings';
      setError(msg);
      setSettings(null);
      setObligations([]);
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async (body: WorkspaceProfileUpdate) => {
    const ws = await workspaceApi.patchWorkspaceProfile(body, orgIdParam);
    setSettings(ws);
    return ws;
  };

  const saveIndustry = async (body: WorkspaceIndustryUpdate) => {
    const ws = await workspaceApi.patchWorkspaceIndustry(body, orgIdParam);
    setSettings(ws);
    return ws;
  };

  const saveDeployment = async (body: WorkspaceDeploymentUpdate) => {
    const ws = await workspaceApi.patchWorkspaceDeployment(body, orgIdParam);
    setSettings(ws);
    return ws;
  };

  const saveRoleMapping = async (body: WorkspaceRoleMappingUpdate) => {
    const ws = await workspaceApi.patchWorkspaceRoleMapping(body, orgIdParam);
    setSettings(ws);
    return ws;
  };

  const createProcessor = async (body: DataProcessorCreate): Promise<DataProcessor> => {
    const proc = await workspaceApi.createProcessor(body, orgIdParam);
    setSettings((prev) =>
      prev
        ? { ...prev, processors: [...prev.processors, proc].sort((a, b) => a.name.localeCompare(b.name)) }
        : prev
    );
    return proc;
  };

  const updateProcessor = async (id: string, body: DataProcessorUpdate): Promise<DataProcessor> => {
    const proc = await workspaceApi.updateProcessor(id, body, orgIdParam);
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            processors: prev.processors.map((p) => (p.id === id ? proc : p)),
          }
        : prev
    );
    return proc;
  };

  const removeProcessor = async (id: string): Promise<void> => {
    await workspaceApi.deleteProcessor(id, orgIdParam);
    setSettings((prev) =>
      prev ? { ...prev, processors: prev.processors.filter((p) => p.id !== id) } : prev
    );
  };

  const exportOptions = () => ({
    exporterEmail: user?.email,
    exporterRole: user?.role,
  });

  const exportEvidencePack = (section: EvidencePackSection) => {
    if (!settings) {
      notify('Workspace settings are not loaded yet. Try again in a moment.');
      return;
    }
    try {
      const filename = downloadEvidencePack(section, settings, obligations, exportOptions());
      notify(`Evidence pack downloaded: ${filename}`);
    } catch {
      notify('Could not generate evidence pack. Please try again.');
    }
  };

  const exportFullEvidencePack = () => {
    if (!settings) {
      notify('Workspace settings are not loaded yet. Try again in a moment.');
      return;
    }
    try {
      const filename = downloadFullEvidencePack(settings, obligations, exportOptions());
      notify(`Full evidence pack downloaded: ${filename}`);
    } catch {
      notify('Could not generate full evidence pack. Please try again.');
    }
  };

  const canExport = hasOrg && !loading && !error && settings !== null;

  return {
    settings,
    obligations,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    reload: load,
    saveProfile,
    saveIndustry,
    saveDeployment,
    saveRoleMapping,
    createProcessor,
    updateProcessor,
    removeProcessor,
    exportEvidencePack,
    exportFullEvidencePack,
    canExport,
  };
}
