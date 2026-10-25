import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listOrganizations } from '@/lib/api/admin';
import * as consentApi from '@/lib/api/consent';
import {
  downloadConsentNoticesEvidencePdf,
  downloadFullConsentEvidencePdf,
  downloadPurposeRegistryEvidencePdf,
  type ConsentEvidenceSection,
} from '@/lib/consent/consentEvidencePackPdf';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit as userCanEdit, hasPermission } from '@/lib/auth/permissions';
import { notify } from '@/app/utils/notify';
import type { Organization } from '@/types/organization';
import type {
  ComplianceCheckResult,
  NoticeCreate,
  NoticeDetail,
  NoticeSummary,
  NoticeVersion,
  NoticeVersionContentUpdate,
  Purpose,
  PurposeCreate,
  PurposeDetail,
  PurposeUpdate,
} from '@/types/consent';

import { readStoredOrgId, syncStoredOrgId } from '@/lib/compliance/orgContext';

export function useConsentManagement() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string>(() =>
    isSuperadmin ? readStoredOrgId() : ''
  );
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const effectiveOrgId = isSuperadmin ? selectedOrgId : (user?.organization_id ?? '');
  const hasOrg = Boolean(effectiveOrgId);
  const canEdit =
    userCanEdit(user) &&
    (hasPermission(user, 'consent.write') || user?.role === 'admin' || user?.role === 'superadmin');
  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    try {
      syncStoredOrgId(id);
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
      setPurposes([]);
      setNotices([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, n] = await Promise.all([
        consentApi.fetchPurposes(orgIdParam, showArchived),
        consentApi.fetchNotices(orgIdParam, showArchived),
      ]);
      setPurposes(p);
      setNotices(n);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load consent data';
      setError(msg);
      setPurposes([]);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPurpose = async (body: PurposeCreate): Promise<Purpose> => {
    const p = await consentApi.createPurpose(body, orgIdParam);
    setPurposes((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
    return p;
  };

  const updatePurpose = async (id: string, body: PurposeUpdate): Promise<Purpose> => {
    const p = await consentApi.updatePurpose(id, body, orgIdParam);
    setPurposes((prev) => prev.map((x) => (x.id === id ? p : x)));
    return p;
  };

  const removePurpose = async (id: string): Promise<void> => {
    await consentApi.archivePurpose(id, orgIdParam);
    setPurposes((prev) => prev.filter((x) => x.id !== id));
  };

  const getPurposeDetail = (id: string): Promise<PurposeDetail> =>
    consentApi.fetchPurpose(id, orgIdParam);

  const createNotice = async (body: NoticeCreate): Promise<NoticeDetail> => {
    const n = await consentApi.createNotice(body, orgIdParam);
    await load();
    return n;
  };

  const getNotice = useCallback(
    (id: string): Promise<NoticeDetail> => consentApi.fetchNotice(id, orgIdParam),
    [orgIdParam]
  );

  const getNoticeVersion = useCallback(
    (noticeId: string, versionId: string): Promise<NoticeVersion> =>
      consentApi.fetchNoticeVersion(noticeId, versionId, orgIdParam),
    [orgIdParam]
  );

  const updateNoticeVersion = async (
    noticeId: string,
    versionId: string,
    body: NoticeVersionContentUpdate
  ): Promise<NoticeVersion> => {
    const v = await consentApi.updateNoticeVersion(noticeId, versionId, body, orgIdParam);
    await load();
    return v;
  };

  const setVersionPurposes = async (
    noticeId: string,
    versionId: string,
    purposeIds: string[]
  ): Promise<NoticeVersion> => {
    const v = await consentApi.setVersionPurposes(noticeId, versionId, purposeIds, orgIdParam);
    await load();
    return v;
  };

  const publishVersion = async (noticeId: string, versionId: string): Promise<NoticeVersion> => {
    const v = await consentApi.publishNoticeVersion(noticeId, versionId, orgIdParam);
    await load();
    return v;
  };

  const runComplianceCheck = async (
    noticeId: string,
    versionId: string,
    autoFix: boolean
  ): Promise<ComplianceCheckResult> => {
    const r = await consentApi.runComplianceCheck(noticeId, versionId, autoFix, orgIdParam);
    await load();
    return r;
  };

  const archiveNotice = async (noticeId: string): Promise<void> => {
    await consentApi.archiveNotice(noticeId, orgIdParam);
    await load();
  };

  const createDraftFromLive = async (noticeId: string) => {
    const v = await consentApi.createDraftFromLive(noticeId, orgIdParam);
    await load();
    return v;
  };

  const organizationName = useMemo(() => {
    const match = organizations.find((org) => org.id === effectiveOrgId);
    return match?.name ?? 'Organization';
  }, [organizations, effectiveOrgId]);

  const evidenceExportContext = useMemo(
    () => ({
      organizationName,
      exporterEmail: user?.email,
      exporterRole: user?.role,
    }),
    [organizationName, user?.email, user?.role]
  );

  const exportConsentEvidencePack = (section: ConsentEvidenceSection) => {
    try {
      const filename =
        section === 'consent-notices'
          ? downloadConsentNoticesEvidencePdf(notices, evidenceExportContext)
          : downloadPurposeRegistryEvidencePdf(purposes, evidenceExportContext);
      notify(`Evidence pack downloaded: ${filename}`);
    } catch {
      notify('Could not generate evidence pack. Please try again.');
    }
  };

  const exportFullConsentEvidencePack = () => {
    try {
      const filename = downloadFullConsentEvidencePdf(
        notices,
        purposes,
        evidenceExportContext
      );
      notify(`Full evidence pack downloaded: ${filename}`);
    } catch {
      notify('Could not generate full evidence pack. Please try again.');
    }
  };

  return {
    purposes,
    notices,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    reload: load,
    createPurpose,
    updatePurpose,
    removePurpose,
    getPurposeDetail,
    createNotice,
    getNotice,
    getNoticeVersion,
    updateNoticeVersion,
    setVersionPurposes,
    publishVersion,
    runComplianceCheck,
    archiveNotice,
    createDraftFromLive,
    exportConsentEvidencePack,
    exportFullConsentEvidencePack,
    showArchived,
    setShowArchived,
    restoreNotice: async (noticeId: string): Promise<void> => {
      await consentApi.unarchiveNotice(noticeId, orgIdParam);
      await load();
    },
    restorePurpose: async (purposeId: string): Promise<void> => {
      await consentApi.unarchivePurpose(purposeId, orgIdParam);
      await load();
    },
  };
}
