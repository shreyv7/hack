import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  /** Raw markdown text (supports GitHub-flavored tables, bold, lists, etc.). */
  children: string;
  className?: string;
}

/**
 * Renders Vajra AI replies as formatted markdown — headings, bold text,
 * lists, code, and GitHub-style tables — instead of raw `**` / `|` characters.
 */
export function MarkdownMessage({ children, className }: MarkdownMessageProps): ReactElement {
  const content = children.replace(/<br\s*\/?>/gi, '\n\n');

  return (
    <div className={cn('text-sm text-[var(--text-primary)] leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold mt-4 mb-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-4 mb-2 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0 text-[var(--text-primary)]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-3 mb-1 first:mt-0 text-[var(--text-secondary)]">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="marker:text-[var(--text-tertiary)]">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--brand-primary)] underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--border-default)] pl-3 my-2 text-[var(--text-secondary)] italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-[var(--border-default)]" />,
          code: ({ className: codeClass, children }) => {
            const isBlock = (codeClass ?? '').includes('language-');
            if (isBlock) {
              return (
                <code className="block w-full text-xs font-mono">{children}</code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[0.85em] font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 p-3 rounded-lg overflow-x-auto bg-[var(--surface-raised)] border border-[var(--border-default)]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border-default)]">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--surface-raised)]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold border-b border-[var(--border-default)] text-[var(--text-primary)]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-[var(--border-default)] align-top text-[var(--text-secondary)]">
              {children}
            </td>
          ),
          tr: ({ children }) => <tr className="last:border-0">{children}</tr>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
