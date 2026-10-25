import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'What are my top 3 compliance risks right now?',
  'Draft a withdrawal notice for the loyalty program',
  'Simulate: what if we get breached tomorrow?',
] as const;

export function CopilotPanel(): ReactElement {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');

  const goToCopilot = (query: string): void => {
    navigate('/ai/copilot', { state: { query } });
  };

  const handleSuggestionClick = (suggestion: string): void => {
    setInputValue(suggestion);
    goToCopilot(suggestion);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (inputValue.trim()) {
      goToCopilot(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="p-0.5 rounded-xl bg-gradient-to-r from-[var(--status-ai)] to-[var(--brand-primary)]">
      <div className="p-5 rounded-xl bg-[var(--surface-card)]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles className="size-5 text-[var(--status-ai)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">ConsentIQ Copilot</h2>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Ask about compliance posture, draft a notice, or analyze risk…"
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all',
                'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)]',
              )}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand-primary)] text-white hover:opacity-90 shrink-0"
            >
              Ask
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate('/ai/copilot')}
            className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline shrink-0"
          >
            Open Copilot
            <ArrowRight className="size-3" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:shadow-sm',
                'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]',
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
