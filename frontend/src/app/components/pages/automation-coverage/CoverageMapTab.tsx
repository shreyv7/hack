import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { AutomationCoverage, AutomationCoverageSectionRow } from '@/types/dashboard';

interface CoverageMapTabProps {
  data: AutomationCoverage | null;
  loading?: boolean;
}

function statusPill(status: string): { className: string; label: string } {
  switch (status) {
    case 'fully':
      return { className: 'pill auto', label: 'Automated' };
    case 'partial':
      return { className: 'pill partial', label: 'Partial' };
    case 'manual':
      return { className: 'pill adv', label: 'Manual' };
    default:
      return { className: 'pill scope', label: 'Not in scope' };
  }
}

function chapterSummary(chapter: AutomationCoverage['chapters'][number]): string {
  const parts: string[] = [];
  if (chapter.fully_automated) parts.push(`${chapter.fully_automated} automated`);
  if (chapter.partial) parts.push(`${chapter.partial} partial`);
  if (chapter.manual) parts.push(`${chapter.manual} manual`);
  return parts.join(' · ') || `${chapter.total} sections`;
}

export function CoverageMapTab({ data, loading }: CoverageMapTabProps): ReactElement {
  const navigate = useNavigate();

  const sectionsByChapter = useMemo(() => {
    const map = new Map<number, AutomationCoverageSectionRow[]>();
    for (const row of data?.sections ?? []) {
      const list = map.get(row.chapter) ?? [];
      list.push(row);
      map.set(row.chapter, list);
    }
    return map;
  }, [data?.sections]);

  if (loading) {
    return <p className="text-sm text-[var(--text-secondary)] p-6">Loading coverage map…</p>;
  }

  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)] p-6">No coverage data.</p>;
  }

  return (
    <>
      <div id="tab-map" className="tabview">
        <div className="info-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
          <div>
            <b>Coverage ≠ compliance.</b> Live posture and penalty exposure live on the{' '}
            <button type="button" className="underline" onClick={() => navigate('/compliance/score')}>
              Compliance Score
            </button>{' '}
            screen. Drill into sections on the{' '}
            <button type="button" className="underline" onClick={() => navigate('/compliance/map')}>
              Compliance Map
            </button>
            .
          </div>
        </div>

        <div className="sec-h">
          <h2>Act Coverage — Chapter by Chapter</h2>
          <div className="h-note">Status reflects platform capability against each statutory section.</div>
        </div>
        <div style={{ height: 18 }} />

        {data.chapters.map((chapter) => {
          const rows = sectionsByChapter.get(chapter.chapter) ?? [];
          return (
            <section key={chapter.chapter} className="chapter">
              <div className="chapter-head">
                <div className="ch-id">
                  <span className="ch-num">Ch {chapter.chapter}</span>
                  <span className="ch-name">{chapter.title}</span>
                </div>
                <div className="ch-summary">
                  <span className="mini auto">{chapterSummary(chapter)}</span>
                </div>
              </div>
              <div className="rows">
                {rows.map((row) => {
                  const pill = statusPill(row.automation_status);
                  return (
                    <div key={row.section_key} className="row">
                      <div className="r-id">S.{row.section_number}</div>
                      <div className="r-main">
                        <div className="r-title">{row.title}</div>
                        <div className="r-reason">
                          {row.feature_count} mapped platform feature{row.feature_count === 1 ? '' : 's'}.
                        </div>
                      </div>
                      <div className="r-status">
                        <button
                          type="button"
                          className={pill.className}
                          onClick={() => row.route_path && navigate(row.route_path)}
                        >
                          {pill.label}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
