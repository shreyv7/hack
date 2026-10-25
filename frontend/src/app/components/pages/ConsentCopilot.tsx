import type { KeyboardEvent, ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Sparkles,
  Plus,
  Search,
  Download,
  Trash2,
  Send,
  X,
  PanelRight,
  AlertTriangle,
  Loader2,
  MessageSquare,
  ChevronRight,
  Square,
  Moon,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Page } from '@/types';
import { MarkdownMessage } from '@/app/components/common/MarkdownMessage';
import { ApiError } from '@/lib/api/client';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import {
  createConversation,
  deleteConversation,
  fetchVajraAiContext,
  fetchVajraAiStatus,
  getConversation,
  listConversations,
  streamConversationMessage,
  type ConversationSummary,
  type VajraAiContextItem,
} from '@/lib/api/vajraAi';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface ConsentCopilotProps {
  /** Navigate to another module (used by the context panel deep-links). */
  onNavigate?: (page: Page) => void;
}

/** Maps a context source (by backend id and by display label) to its module. */
const NAV_TARGETS: Record<string, Page> = {
  breach_incidents: 'breach-disclosure-wizard',
  consent_notices: 'notices',
  pii_scanner: 'pii-scanner',
  compliance_score: 'compliance-score',
  'Breach Incidents': 'breach-disclosure-wizard',
  'Consent Notices': 'notices',
  'PII Scanner Results': 'pii-scanner',
  'Compliance Score': 'compliance-score',
};

const SUGGESTION_CHIPS: string[] = [
  "Summarize this month's consent posture",
  'Draft a DSAR response template',
  'What are our top compliance risks?',
  'Explain DPDPA breach notification timelines',
];

/** Bucket a conversation's last-activity time into a sidebar group label. */
function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(startOfToday.getDate() - 7);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= sevenDaysAgo) return 'Previous 7 days';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\d\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'conversation';
}

/**
 * Vajra AI Consent Copilot — persistent conversations, real workspace context,
 * and a chat workspace powered by Vajra AI.
 */
export function ConsentCopilot({ onNavigate }: ConsentCopilotProps = {}): ReactElement {
  const location = useLocation();
  const { orgIdParam, hasOrg, isSuperadmin } = useComplianceOrg();

  const [showContext, setShowContext] = useState(true);
  const [useCompanyData, setUseCompanyData] = useState(true);
  const [messageInput, setMessageInput] = useState('');
  const [search, setSearch] = useState('');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [referenced, setReferenced] = useState<string[]>([]);

  const [contextItems, setContextItems] = useState<VajraAiContextItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const [handoffContext, setHandoffContext] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { query?: string; context?: string; dashboardName?: string } | null;
    const query = state?.query?.trim();
    const ctx = state?.context?.trim();
    if (query) {
      setMessageInput(query);
    }
    if (ctx) {
      setHandoffContext(ctx);
    }
    if (query || ctx) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const toggleDarkMode = (): void => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    if (nextIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleStopStreaming = (): void => {
    if (activeReaderRef.current) {
      void activeReaderRef.current.cancel().catch(() => {});
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  // --- Initial loads --------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    fetchVajraAiStatus()
      .then((s) => !cancelled && setAiConfigured(s.configured))
      .catch(() => !cancelled && setAiConfigured(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshConversations = useCallback(() => {
    if (!hasOrg) return;
    listConversations(orgIdParam)
      .then(setConversations)
      .catch(() => {
        /* surfaced lazily; sidebar simply stays empty */
      });
  }, [hasOrg, orgIdParam]);

  const refreshContext = useCallback(() => {
    if (!hasOrg) return;
    fetchVajraAiContext(orgIdParam)
      .then((r) => setContextItems(r.items))
      .catch(() => setContextItems([]));
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    refreshConversations();
    refreshContext();
  }, [refreshConversations, refreshContext]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // --- Actions --------------------------------------------------------------

  const startNewConversation = (): void => {
    setActiveId(null);
    setMessages([]);
    setReferenced([]);
    setError(null);
    setMessageInput('');
  };

  const selectConversation = async (id: string): Promise<void> => {
    if (id === activeId) return;
    setActiveId(id);
    setError(null);
    setIsLoadingDetail(true);
    try {
      const detail = await getConversation(id, orgIdParam);
      setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })));
      setReferenced(detail.context_used ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this conversation.');
      setMessages([]);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const upsertToTop = (summary: ConversationSummary): void => {
    setConversations((prev) => [summary, ...prev.filter((c) => c.id !== summary.id)]);
  };

  const sendMessage = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !hasOrg) return;

    setError(null);
    setMessageInput('');

    // On the first message of a Governance AI handoff, prepend the compact context
    // snapshot so the model has live dashboard metrics without an extra AI round-trip.
    let payload = trimmed;
    if (handoffContext && messages.length === 0) {
      payload = `[Dashboard context]\n${handoffContext}\n\n[Question]\n${trimmed}`;
      setHandoffContext(null);
    }

    // Optimistically push user message, and a placeholder assistant message to stream into
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }]);
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let convId = activeId;
      if (!convId) {
        const created = await createConversation(orgIdParam);
        convId = created.id;
        setActiveId(convId);
        upsertToTop(created);
      }
      const response = await streamConversationMessage(convId, payload, useCompanyData, orgIdParam, controller.signal);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream reader available');
      activeReaderRef.current = reader;

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;
          
          try {
            const dataStr = trimmedLine.slice(6);
            const parsed = JSON.parse(dataStr);
            
            if (parsed.type === 'content') {
              assistantText += parsed.delta;
              setMessages((prev) => {
                const next = [...prev];
                if (next.length > 0 && next[next.length - 1].role === 'assistant') {
                  next[next.length - 1] = { role: 'assistant', content: assistantText };
                }
                return next;
              });
            } else if (parsed.type === 'done') {
              const detail = parsed.conversation;
              setMessages(detail.messages.map((m: any) => ({ role: m.role, content: m.content })));
              setReferenced(detail.context_used ?? []);
              upsertToTop(detail);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.detail);
            }
          } catch (e) {
            console.error('Error parsing SSE line:', e);
          }
        }
      }
    } catch (err) {
      const wasAborted = controller.signal.aborted;
      if (!wasAborted) {
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong reaching Vajra AI. Please try again.',
        );
        // Remove optimistic messages if failed before stream starts, or keep whatever we have
        setMessages((prev) => {
          // If the last message was the placeholder assistant message and is empty, drop both user & placeholder
          const next = [...prev];
          if (next.length >= 2) {
            const last = next[next.length - 1];
            if (last.role === 'assistant' && !last.content) {
              return next.slice(0, -2);
            }
          }
          return next;
        });
        setMessageInput(trimmed);
      }
    } finally {
      const wasAborted = controller.signal.aborted;
      setIsSending(false);
      activeReaderRef.current = null;
      abortControllerRef.current = null;

      if (wasAborted) {
        // Fetch updated conversation detail to synchronize state with DB
        const finalConvId = activeId || conversations[0]?.id;
        if (finalConvId) {
          void getConversation(finalConvId, orgIdParam)
            .then((detail) => {
              setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })));
              setReferenced(detail.context_used ?? []);
              upsertToTop(detail);
            })
            .catch(() => {});
        }
      }
    }
  };

  const goToSource = (key: string): void => {
    const target = NAV_TARGETS[key];
    if (target) onNavigate?.(target);
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(id, orgIdParam);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) startNewConversation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the conversation.');
    }
  };

  const handleDownload = (): void => {
    if (messages.length === 0) return;
    const title = activeConversation?.title ?? 'Vajra AI conversation';
    const body = messages
      .map((m) => `## ${m.role === 'user' ? 'You' : 'Vajra AI'}\n\n${m.content}\n`)
      .join('\n');
    const md = `# ${title}\n\n_Exported ${new Date().toLocaleString()}_\n\n${body}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(messageInput);
    }
  };

  // --- Derived --------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
  }, [conversations, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const c of filtered) {
      const label = groupLabel(c.updated_at);
      (map.get(label) ?? map.set(label, []).get(label)!).push(c);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [filtered]);

  // --- Render ---------------------------------------------------------------

  if (isSuperadmin && !hasOrg) {
    return (
      <div className="size-full flex items-center justify-center bg-[var(--surface-app)] text-[var(--text-secondary)]">
        <p className="text-sm">Select an organization to use Vajra AI.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex overflow-hidden bg-gradient-to-br from-[#FAFAF9] to-[#F5F3FF] dark:from-[#0F0F0F] dark:to-[#18181B]">
      {/* LEFT PANE — Conversation history */}
      <aside className="flex-shrink-0 flex flex-col border-r w-72 bg-[var(--surface-card)] border-[var(--border-default)] min-h-0">
        <div className="p-4 border-b border-[var(--border-default)] space-y-3">
          <button
            type="button"
            onClick={startNewConversation}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            New conversation
          </button>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {grouped.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-[var(--text-tertiary)]">
              {search ? 'No matching conversations.' : 'No conversations yet. Start a new one.'}
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-2 mb-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      'group flex items-center rounded-lg transition-colors',
                      activeId === chat.id
                        ? 'bg-[var(--status-ai-bg)]'
                        : 'hover:bg-black/5',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void selectConversation(chat.id)}
                      className={cn(
                        'flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium',
                        activeId === chat.id
                          ? 'text-[var(--brand-primary)]'
                          : 'text-[var(--text-primary)]',
                      )}
                    >
                      <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" strokeWidth={1.5} />
                      <span className="truncate">{chat.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chat.id)}
                      title="Delete conversation"
                      className="flex-shrink-0 p-2 mr-1 rounded-md text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--status-danger)] hover:bg-black/5 transition-all"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT PANE — Active conversation */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar */}
        <div className="flex-shrink-0 px-6 py-3.5 border-b flex items-center justify-between gap-4 bg-[var(--surface-card)] border-[var(--border-default)]">
          <h1 className="text-base font-semibold truncate text-[var(--text-primary)]">
            {activeConversation?.title ?? 'New conversation'}
          </h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={messages.length === 0}
              title="Download transcript"
              className="p-2 rounded-lg hover:bg-black/5 transition-colors disabled:opacity-40 text-[var(--text-tertiary)]"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
            </button>
            {activeId && (
              <button
                type="button"
                onClick={() => void handleDelete(activeId)}
                title="Delete conversation"
                className="p-2 rounded-lg hover:bg-black/5 transition-colors text-[var(--text-tertiary)] hover:text-[var(--status-danger)]"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              onClick={toggleDarkMode}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg hover:bg-black/5 transition-colors text-[var(--text-tertiary)]"
            >
              {isDark ? (
                <Sun className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Moon className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            {!showContext && (
              <button
                type="button"
                onClick={() => setShowContext(true)}
                title="Show context"
                className="p-2 rounded-lg hover:bg-black/5 transition-colors text-[var(--text-tertiary)]"
              >
                <PanelRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left column: scrolling messages + pinned input */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Conversation area (the only thing that scrolls) */}
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
              {messages.length === 0 && !isSending && !isLoadingDetail && (
                <div className="flex flex-col items-center justify-center text-center py-16">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-[var(--status-ai)] to-[var(--brand-primary)]">
                    <Sparkles className="w-7 h-7 text-white" strokeWidth={2} />
                  </div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    How can Vajra AI help today?
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] max-w-md">
                    Ask about your compliance posture, draft DPDPA notices, or analyze risks.
                    {useCompanyData
                      ? ' Your workspace context is shared with Vajra AI.'
                      : ' Enable “Use my company’s data” for personalized answers.'}
                  </p>
                  {aiConfigured === false && (
                    <div className="mt-6 flex items-start gap-2 max-w-md text-left px-4 py-3 rounded-xl bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
                      <span className="text-xs">
                        Vajra AI isn&apos;t configured yet. Please contact your administrator to
                        enable it.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isLoadingDetail && (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-tertiary)]">
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                  Loading conversation…
                </div>
              )}

              {!isLoadingDetail &&
                messages.map((message, index) =>
                  message.role === 'user' ? (
                    <div key={index} className="flex justify-end">
                      <div className="max-w-2xl px-5 py-3 rounded-2xl text-sm whitespace-pre-wrap bg-[var(--brand-primary)] text-white">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={index} className="flex gap-4">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[var(--status-ai)] to-[var(--brand-primary)]">
                        <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
                      </div>
                      <div className="flex-1 pt-0.5 min-w-0">
                        {message.content ? (
                          <MarkdownMessage>{message.content}</MarkdownMessage>
                        ) : isSending && index === messages.length - 1 ? (
                          <div className="flex items-center gap-2 pt-1 text-sm text-[var(--text-tertiary)]">
                            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                            Vajra AI is thinking&hellip;
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ),
                )}

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div ref={scrollAnchorRef} />
            </div>
            </div>

            {/* Input area — pinned below the scrolling messages */}
            <div className="flex-shrink-0 border-t bg-[var(--surface-card)] border-[var(--border-default)]">
              <div className="max-w-3xl mx-auto px-6 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {SUGGESTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={isSending}
                        onClick={() => void sendMessage(chip)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-80 transition-all disabled:opacity-50 bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Ask Vajra AI anything about your compliance posture…"
                    rows={3}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 pr-14 rounded-xl resize-none border transition-colors focus:outline-none focus:border-[var(--brand-primary)] bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={isSending ? handleStopStreaming : () => void sendMessage(messageInput)}
                    disabled={!isSending && !messageInput.trim()}
                    className="absolute right-3 bottom-3 p-2.5 rounded-lg transition-colors bg-[var(--brand-primary)] text-white disabled:opacity-50"
                  >
                    {isSending ? (
                      <Square className="w-4 h-4 fill-current" strokeWidth={2} />
                    ) : (
                      <Send className="w-4 h-4" strokeWidth={2} />
                    )}
                  </button>
                </div>

                <p className="text-xs text-center text-[var(--text-tertiary)]">
                  Vajra AI can make mistakes. Verify legal language with your DPO.
                </p>
              </div>
            </div>
          </div>

          {/* Context panel */}
          {showContext && (
            <aside className="w-80 border-l flex-shrink-0 overflow-y-auto bg-[var(--surface-card)] border-[var(--border-default)]">
              <div className="p-5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--text-primary)]">Context</h3>
                  <button
                    type="button"
                    onClick={() => setShowContext(false)}
                    className="p-1 rounded hover:bg-black/5 transition-colors"
                  >
                    <X className="w-4 h-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Toggle */}
                <div className="p-4 rounded-xl space-y-2 bg-[var(--surface-raised)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Use my company&apos;s data
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useCompanyData}
                      onClick={() => setUseCompanyData((v) => !v)}
                      className={cn(
                        'w-11 h-6 rounded-full relative transition-colors flex-shrink-0',
                        useCompanyData ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border-default)]',
                      )}
                    >
                      <span
                        className={cn(
                          'w-5 h-5 rounded-full absolute top-0.5 left-0.5 transition-transform bg-white',
                          useCompanyData ? 'translate-x-5' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    When on, Vajra AI grounds answers in your live workspace data below.
                  </p>
                </div>

                {/* Current data access — each row deep-links to its module */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                    Current data access
                  </h4>
                  {contextItems.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)]">No workspace data available.</p>
                  ) : (
                    <div className="space-y-2">
                      {contextItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goToSource(item.id)}
                          title={`Open ${item.label}`}
                          className="group w-full flex items-center justify-between gap-3 p-3 rounded-lg text-left bg-[var(--surface-raised)] hover:bg-[var(--status-ai-bg)] transition-colors"
                        >
                          <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">
                              {item.value}
                            </span>
                            <ChevronRight
                              className="w-4 h-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
                              strokeWidth={1.5}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Referenced in this chat — sources actually shared with the model */}
                <div className="space-y-2.5">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                    Referenced in this chat
                  </h4>
                  {referenced.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {useCompanyData
                        ? 'Once you send a message, the workspace data Vajra AI used appears here as quick links.'
                        : 'Turn on “Use my company’s data” so Vajra AI can ground answers in your workspace — sources will be listed here.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {referenced.map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => goToSource(label)}
                          title={`Open ${label}`}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--status-ai-bg)] text-[var(--brand-primary)] hover:opacity-80 transition-opacity"
                        >
                          {label}
                          <ChevronRight className="w-3 h-3" strokeWidth={2} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
