import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';
import type {
  CisoDashboardSummary,
  CisoControl,
  CisoEvidence,
  CisoRisk,
  CisoRemediationTask,
  CisoException,
  CisoControlComment,
  CisoControlReview,
  CisoScoreSettings,
  CisoScoreSnapshot,
  CisoBoardReport,
  CisoControlVersion,
  CisoActivity,
  CisoOrganizationControl,
} from '@/types';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchCisoDashboard(orgId?: string): Promise<CisoDashboardSummary> {
  return apiFetch(withOrgQuery('/ciso/dashboard', orgId));
}

export function fetchCisoBenchmarkMatrix(): Promise<any[]> {
  return apiFetch('/ciso/benchmark-matrix');
}

export function fetchCisoControls(params: { status?: string; framework?: string; search?: string; orgId?: string } = {}): Promise<CisoControl[]> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.framework) q.set('framework', params.framework);
  if (params.search) q.set('search', params.search);
  const qs = q.toString();
  return apiFetch(withOrgQuery(`/ciso/controls${qs ? `?${qs}` : ''}`, params.orgId));
}

export function fetchCisoControl(id: string, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${id}`, orgId));
}

export function createCisoControl(body: any, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery('/ciso/controls', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCisoControl(id: string, body: any, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function createCisoEvidence(formData: FormData, orgId?: string, onProgress?: (progress: number) => void): Promise<CisoEvidence> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${getApiBaseUrl()}${withOrgQuery('/ciso/evidence', orgId)}`;
    
    xhr.open('POST', url);
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        let detail = xhr.statusText;
        try {
          const body = JSON.parse(xhr.responseText);
          if (typeof body.detail === 'string') detail = body.detail;
        } catch {
          // ignore
        }
        reject(new Error(detail));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

export function listCisoEvidence(orgId?: string): Promise<CisoEvidence[]> {
  return apiFetch(withOrgQuery('/ciso/evidence', orgId));
}

export function deleteCisoEvidence(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrgQuery(`/ciso/evidence/${id}`, orgId), {
    method: 'DELETE',
  });
}

export function listCisoRisks(orgId?: string): Promise<CisoRisk[]> {
  return apiFetch(withOrgQuery('/ciso/risks', orgId));
}

export function createCisoRisk(body: any, orgId?: string): Promise<CisoRisk> {
  return apiFetch(withOrgQuery('/ciso/risks', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listCisoRemediation(orgId?: string): Promise<CisoRemediationTask[]> {
  return apiFetch(withOrgQuery('/ciso/remediation', orgId));
}

export function createCisoRemediation(body: any, controlIds?: string[], orgId?: string): Promise<CisoRemediationTask> {
  const q = new URLSearchParams();
  if (controlIds) {
    controlIds.forEach(id => q.append('control_ids', id));
  }
  const qs = q.toString();
  return apiFetch(withOrgQuery(`/ciso/remediation${qs ? `?${qs}` : ''}`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCisoRemediation(id: string, body: any, orgId?: string): Promise<CisoRemediationTask> {
  return apiFetch(withOrgQuery(`/ciso/remediation/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function listCisoExceptions(orgId?: string): Promise<CisoException[]> {
  return apiFetch(withOrgQuery('/ciso/exceptions', orgId));
}

export function createCisoException(body: any, orgId?: string): Promise<CisoException> {
  return apiFetch(withOrgQuery('/ciso/exceptions', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function addCisoControlComment(controlId: string, comment: string, orgId?: string): Promise<CisoControlComment> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/comments`, orgId), {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
}

export function addCisoControlReview(controlId: string, body: { outcome: string; notes?: string }, orgId?: string): Promise<CisoControlReview> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/reviews`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchCisoSettings(orgId?: string): Promise<CisoScoreSettings> {
  return apiFetch(withOrgQuery('/ciso/settings', orgId));
}

export function updateCisoSettings(body: any, orgId?: string): Promise<CisoScoreSettings> {
  return apiFetch(withOrgQuery('/ciso/settings', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchCisoAnalytics(days: number = 30, orgId?: string): Promise<CisoScoreSnapshot[]> {
  return apiFetch(withOrgQuery(`/ciso/analytics?days=${days}`, orgId));
}

export function fetchCisoReports(orgId?: string): Promise<CisoBoardReport[]> {
  return apiFetch(withOrgQuery('/ciso/reports', orgId));
}

export function generateCisoReport(orgId?: string): Promise<CisoBoardReport> {
  return apiFetch(withOrgQuery('/ciso/reports/generate', orgId), {
    method: 'POST',
  });
}

export function fetchCisoActivities(params: { entityType?: string; entityId?: string; limit?: number; orgId?: string } = {}): Promise<CisoActivity[]> {
  const q = new URLSearchParams();
  if (params.entityType) q.set('entity_type', params.entityType);
  if (params.entityId) q.set('entity_id', params.entityId);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return apiFetch(withOrgQuery(`/ciso/activities${qs ? `?${qs}` : ''}`, params.orgId));
}

export function fetchCisoControlVersions(controlId: string, orgId?: string): Promise<CisoControlVersion[]> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/versions`, orgId));
}

export function fetchCisoOrgControls(orgId?: string): Promise<CisoOrganizationControl[]> {
  return apiFetch(withOrgQuery('/ciso/organization-controls', orgId));
}

export function createCisoOrgControl(body: any, orgId?: string): Promise<CisoOrganizationControl> {
  return apiFetch(withOrgQuery('/ciso/organization-controls', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCisoOrgControl(id: string, body: any, orgId?: string): Promise<CisoOrganizationControl> {
  return apiFetch(withOrgQuery(`/ciso/organization-controls/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteCisoOrgControl(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrgQuery(`/ciso/organization-controls/${id}`, orgId), {
    method: 'DELETE',
  });
}

export function fetchCisoAssets(orgId?: string): Promise<any[]> {
  return apiFetch(withOrgQuery('/ciso/assets', orgId));
}

export function createCisoAsset(body: any, orgId?: string): Promise<any> {
  return apiFetch(withOrgQuery('/ciso/assets', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCisoAsset(id: string, body: any, orgId?: string): Promise<any> {
  return apiFetch(withOrgQuery(`/ciso/assets/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteCisoAsset(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrgQuery(`/ciso/assets/${id}`, orgId), {
    method: 'DELETE',
  });
}

export function linkAssetToControl(controlId: string, assetId: string, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/link-asset/${assetId}`, orgId), {
    method: 'POST',
  });
}

export function unlinkAssetFromControl(controlId: string, assetId: string, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/unlink-asset/${assetId}`, orgId), {
    method: 'POST',
  });
}

export function linkPolicyToControl(controlId: string, policyId: string, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/link-policy/${policyId}`, orgId), {
    method: 'POST',
  });
}

export function unlinkPolicyFromControl(controlId: string, policyId: string, orgId?: string): Promise<CisoControl> {
  return apiFetch(withOrgQuery(`/ciso/controls/${controlId}/unlink-policy/${policyId}`, orgId), {
    method: 'POST',
  });
}

export function triggerAssetScan(assetId: string, orgId?: string): Promise<any> {
  return apiFetch(withOrgQuery(`/ciso/assets/${assetId}/trigger-scan`, orgId), {
    method: 'POST',
  });
}

export function fetchAssetScanLogs(assetId: string, orgId?: string): Promise<any[]> {
  return apiFetch(withOrgQuery(`/ciso/assets/${assetId}/scan-logs`, orgId));
}

export async function downloadCisoEvidence(evidenceId: string, fileName: string, orgId?: string): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const qs = orgId ? `?org_id=${orgId}` : '';
  const response = await fetch(`${getApiBaseUrl()}/ciso/evidence/${evidenceId}/download${qs}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Failed to download evidence file';
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = errJson.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadCisoBoardReport(reportId: string, title: string, orgId?: string): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const qs = orgId ? `?org_id=${orgId}` : '';
  const response = await fetch(`${getApiBaseUrl()}/ciso/reports/download/${reportId}${qs}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Failed to download board report PDF';
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = errJson.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  const blob = await response.blob();
  const pdfBlob = new Blob([blob], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '_')}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
    window.URL.revokeObjectURL(url);
  }, 1000);
}


