import { apiFetch, getApiBaseUrl, ApiError } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';

function withOrg(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export interface ShieldAiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ShieldAiStatus {
  configured: boolean;
  provider?: string | null;
  model_id: string | null;
  region: string | null;
}

/** Whether Shield AI is configured on the backend. */
export function fetchShieldAiStatus(): Promise<ShieldAiStatus> {
  return apiFetch('/ai/status');
}

/** Multi-turn chat for the Consent Copilot. */
export function shieldAiChat(
  messages: ShieldAiChatMessage[],
  context?: string,
): Promise<{ reply: string }> {
  return apiFetch('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, context }),
  });
}

/** Short, actionable recommendation bullets for the Shield AI cards. */
export function shieldAiRecommendations(params: {
  topic: string;
  context?: string;
  count?: number;
}): Promise<{ suggestions: string[] }> {
  return apiFetch('/ai/recommendations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Free-text generation (banner/notice copy, drafts, summaries). */
export function shieldAiGenerate(params: {
  task: string;
  context?: string;
  max_tokens?: number;
}): Promise<{ text: string }> {
  return apiFetch('/ai/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// --- Workspace context -------------------------------------------------------

export interface ShieldAiContextItem {
  id: string;
  label: string;
  value: string;
}

/** Real "Current data access" snapshot for the context panel. */
export function fetchShieldAiContext(orgId?: string): Promise<{ items: ShieldAiContextItem[] }> {
  return apiFetch(withOrg('/ai/context', orgId));
}

// --- Persisted conversations -------------------------------------------------

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  context_used: string[];
  messages: ConversationMessage[];
}

export function listConversations(orgId?: string): Promise<ConversationSummary[]> {
  return apiFetch(withOrg('/ai/conversations', orgId));
}

export function createConversation(orgId?: string, title?: string): Promise<ConversationDetail> {
  return apiFetch(withOrg('/ai/conversations', orgId), {
    method: 'POST',
    body: JSON.stringify({ title: title ?? null }),
  });
}

export function getConversation(id: string, orgId?: string): Promise<ConversationDetail> {
  return apiFetch(withOrg(`/ai/conversations/${id}`, orgId));
}

export function renameConversation(
  id: string,
  title: string,
  orgId?: string,
): Promise<ConversationDetail> {
  return apiFetch(withOrg(`/ai/conversations/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`/ai/conversations/${id}`, orgId), { method: 'DELETE' });
}

/** Send a user turn; returns the full refreshed conversation (with the reply). */
export function sendConversationMessage(
  id: string,
  content: string,
  useCompanyData: boolean,
  orgId?: string,
): Promise<ConversationDetail> {
  return apiFetch(withOrg(`/ai/conversations/${id}/messages`, orgId), {
    method: 'POST',
    body: JSON.stringify({ content, use_company_data: useCompanyData }),
  });
}

/** Send a user turn and return a stream of Server-Sent Events (SSE). */
export async function streamConversationMessage(
  id: string,
  content: string,
  useCompanyData: boolean,
  orgId?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${getApiBaseUrl()}${withOrg(`/ai/conversations/${id}/messages/stream`, orgId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, use_company_data: useCompanyData }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(
      0,
      `Cannot reach the API. Make sure the backend is running.`,
    );
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json() as { detail?: string | unknown };
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (body.detail !== undefined) {
        detail = JSON.stringify(body.detail);
      }
    } catch {}
    throw new ApiError(response.status, detail);
  }

  return response;
}


// --- Consent Notice Drafting -------------------------------------------------

export interface ConsentDraftResult {
  notice_title?: string;
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
}

export interface ConsentDraftFromQuestionsRequest {
  org_name: string;
  industry: string;
  data_types: string;
  dpo_name: string;
  dpo_email: string;
  retention_period: string;
  purpose: string;
  language?: string;
}

export function draftConsentFromUpload(file: File): Promise<ConsentDraftResult> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/ai/consent/draft-from-upload', {
    method: 'POST',
    body: formData,
  });
}

export function draftConsentFromQuestions(
  payload: ConsentDraftFromQuestionsRequest,
): Promise<ConsentDraftResult> {
  return apiFetch('/ai/consent/draft-from-questions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


