import { apiFetch } from '@/lib/api/client';
import type { OverlayComment, VisionAnswer } from '@/types/overlay';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchOverlayComments(orgId?: string): Promise<OverlayComment[]> {
  return apiFetch<OverlayComment[]>(withOrgQuery('/overlay/comments', orgId));
}

export function postOverlayComment(body: string, orgId?: string): Promise<OverlayComment> {
  return apiFetch<OverlayComment>(withOrgQuery('/overlay/comments', orgId), {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function deleteOverlayComment(commentId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/overlay/comments/${commentId}`, orgId), {
    method: 'DELETE',
  });
}

export function askVisionQuery(
  imageBase64: string,
  question: string
): Promise<VisionAnswer> {
  return apiFetch<VisionAnswer>('/overlay/vision-query', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64, question }),
  });
}
