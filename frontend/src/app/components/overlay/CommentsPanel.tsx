import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import {
  overlayBtnClass,
  overlayCardClass,
  overlayInputClass,
} from '@/app/components/overlay/overlayStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { ApiError } from '@/lib/api/client';
import {
  deleteOverlayComment,
  fetchOverlayComments,
  postOverlayComment,
} from '@/lib/api/overlayAssistant';
import type { OverlayComment } from '@/types/overlay';
import { cn } from '@/lib/utils';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Comments service unavailable. Restart the backend to load the latest API.';
    }
    if (error.status === 403) {
      return error.message || 'You do not have permission to view comments for this organization.';
    }
    return error.message || 'Request failed';
  }
  if (error instanceof Error) return error.message;
  return 'Failed to load comments';
}

interface CommentsPanelProps {
  active: boolean;
}

export function CommentsPanel({ active }: CommentsPanelProps): ReactElement {
  const { user } = useAuth();
  const { orgIdParam, hasOrg } = useComplianceOrg();
  const [comments, setComments] = useState<OverlayComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    if (!hasOrg) {
      setComments([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchOverlayComments(orgIdParam);
      setComments(data);
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void loadComments();
  }, [active, loadComments]);

  useEffect(() => {
    if (!active || !hasOrg) return;
    const interval = window.setInterval(() => {
      void loadComments();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [active, hasOrg, loadComments]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments]);

  const handlePost = async () => {
    const text = draft.trim();
    if (!text || !hasOrg || posting) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postOverlayComment(text, orgIdParam);
      setComments((prev) => [...prev, created]);
      setDraft('');
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!hasOrg) return;
    try {
      await deleteOverlayComment(commentId, orgIdParam);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  const canDelete = (comment: OverlayComment) =>
    user?.id === comment.user_id ||
    user?.role === 'admin' ||
    user?.role === 'superadmin';

  if (!hasOrg) {
    return (
      <p className="text-sm text-gray-600 px-1 py-4 text-center">
        Select an organization to view team comments.
      </p>
    );
  }

  return (
    <div className="flex flex-col h-[320px]">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {loading && comments.length === 0 && !error ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error && comments.length === 0 ? (
          <p className="text-sm text-red-700 text-center py-8 px-2">{error}</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">
            No comments yet. Be the first to leave a note for your team.
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className={cn('group', overlayCardClass)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-gray-900 truncate">
                      {comment.author_name}
                    </span>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {formatRelative(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-words">
                    {comment.body}
                  </p>
                </div>
                {canDelete(comment) && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(comment.id)}
                    className={cn(
                      'opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-500 hover:text-red-700 hover:bg-white/80 transition-all shrink-0 border border-transparent hover:border-black/15',
                      'group-hover:opacity-100 opacity-100 sm:opacity-0'
                    )}
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {error && comments.length > 0 && (
        <p className="text-xs text-red-700 mt-2 px-1">{error}</p>
      )}

      <div className="mt-3 flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handlePost();
            }
          }}
          placeholder="Leave a note for your team…"
          rows={2}
          maxLength={2000}
          className={cn('flex-1 resize-none', overlayInputClass)}
        />
        <button
          type="button"
          onClick={() => void handlePost()}
          disabled={!draft.trim() || posting}
          className={cn(
            'shrink-0 h-9 w-9 flex items-center justify-center rounded-xl disabled:opacity-40',
            overlayBtnClass,
            'bg-[var(--brand-primary)]/90 text-white border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]'
          )}
          aria-label="Post comment"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
