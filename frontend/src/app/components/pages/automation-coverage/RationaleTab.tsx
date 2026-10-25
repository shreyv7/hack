import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { AutomationCoverage, AutomationCoverageSectionRow } from '@/types/dashboard';

interface RationaleTabProps {
  data: AutomationCoverage | null;
  loading?: boolean;
}

function statusPill(status: string): { className: string; label: string; icon: 'check' | 'partial' | 'minus' | 'doc' } {
  switch (status) {
    case 'fully':
      return { className: 'pill auto', label: 'Automated', icon: 'check' };
    case 'partial':
      return { className: 'pill partial', label: 'Partial', icon: 'partial' };
    case 'manual':
      return { className: 'pill adv', label: 'Manual', icon: 'doc' };
    default:
      return { className: 'pill scope', label: 'Not in scope', icon: 'minus' };
  }
}

function chapterSummary(chapter: AutomationCoverage['chapters'][number]): string {
  const parts: string[] = [];
  if (chapter.fully_automated) parts.push(`${chapter.fully_automated} automated`);
  if (chapter.partial) parts.push(`${chapter.partial} partial`);
  if (chapter.manual) parts.push(`${chapter.manual} manual`);
  return parts.join(' · ') || `${chapter.total} sections`;
}

function rationaleForSection(row: AutomationCoverageSectionRow): string {
  switch (row.automation_status) {
    case 'fully':
      return `All ${row.feature_count} mapped platform features for ${row.title} are implemented with live evidence.`;
    case 'partial':
      return `Some controls for ${row.title} are automated (${row.feature_count} mapped features); remaining items need configuration or external integration.`;
    case 'manual':
      return `${row.title} requires manual legal or operational judgment — the platform provides advisory support only.`;
    default:
      return `${row.title} is definitional or outside Data Fiduciary operational scope in the current platform mapping.`;
  }
}

function StatusIcon({ kind }: { kind: ReturnType<typeof statusPill>['icon'] }): ReactElement {
  if (kind === 'check') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4 10-11" />
      </svg>
    );
  }
  if (kind === 'partial') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 010 18z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === 'doc') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 4h10l3 3v13H7z" />
        <path d="M9 9h7M9 13h7M9 17h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14" />
    </svg>
  );
}

export function RationaleTab({ data, loading }: RationaleTabProps): ReactElement {
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
    return <p className="text-sm text-[var(--text-secondary)] p-6">Loading automation rationale…</p>;
  }

  if (!data) {
    return <p className="text-sm text-[var(--text-secondary)] p-6">No coverage data.</p>;
  }

  return (
    <>
      <div id="tab-why" className="tabview">
        <p className="why-intro">
          The classification logic behind every status. Counts and section statuses below are computed from live
          platform feature mappings and implementation evidence for your organization.
        </p>
        <div className="sec-h">
          <h2>The decision framework</h2>
          <div className="h-note">Every section is tagged with one or more of these codes.</div>
        </div>
        <div style={{ height: 16 }} />
        <div className="fw-grid">
          <div className="fw-card">
            <div className="fw-head green">
              <span className="fw-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4 10-11" />
                </svg>
              </span>
              <h3>Why a control IS automated</h3>
              <span className="sub">Automation drivers</span>
            </div>
            <div className="fw-body">
              <div className="fw-item">
                <span className="fw-code code-a">A1</span>
                <div>
                  <div className="fw-name">Deterministic & repeatable</div>
                  <div className="fw-def">A rule-based operation with no ambiguity — the same input always yields the same output.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-a">A2</span>
                <div>
                  <div className="fw-name">Clear statutory trigger</div>
                  <div className="fw-def">A defined event fires the action (consent withdrawn → erase; breach detected → notify).</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-a">A3</span>
                <div>
                  <div className="fw-name">Platform controls the data</div>
                  <div className="fw-def">The records, identities or config needed to act already sit inside the platform.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-a">A4</span>
                <div>
                  <div className="fw-name">Prescribed-format artifact</div>
                  <div className="fw-def">The output is a templated document in the form the Act / Rules require (notice, intimation, DSR response).</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-a">A5</span>
                <div>
                  <div className="fw-name">Quantifiable / measurable</div>
                  <div className="fw-def">The duty can be scored or timed — penalty exposure, SLA windows, completeness checks.</div>
                </div>
              </div>
            </div>
          </div>
          <div className="fw-card">
            <div className="fw-head warn">
              <span className="fw-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3.1l-8-14a2 2 0 00-3.4 0z" />
                </svg>
              </span>
              <h3>Why a control is NOT (fully) automated</h3>
              <span className="sub">10 reasons</span>
            </div>
            <div className="fw-body">
              <div className="fw-sub">Addressable limits — automatable over time</div>
              <div className="fw-item">
                <span className="fw-code code-n">N1</span>
                <div>
                  <div className="fw-name">Legal judgment required</div>
                  <div className="fw-def">Choosing a lawful basis, an exemption, or an undertaking needs human counsel.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-n">N2</span>
                <div>
                  <div className="fw-name">Customer-side infrastructure</div>
                  <div className="fw-def">The control lives in the customer&apos;s own environment (network, hosts, key management).</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-n">N3</span>
                <div>
                  <div className="fw-name">External system or third party</div>
                  <div className="fw-def">Needs a connector to a third-party system or a third-party engagement (e.g. independent auditor).</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-n">N4</span>
                <div>
                  <div className="fw-name">Human verification event</div>
                  <div className="fw-def">A real-world event must be verified before action (death, incapacity).</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-n">N5</span>
                <div>
                  <div className="fw-name">Pending Government notification</div>
                  <div className="fw-def">Enforcement awaits a notified list or rule (e.g. restricted-transfer countries).</div>
                </div>
              </div>
              <div className="fw-sub">Outside the fiduciary&apos;s remit — structural</div>
              <div className="fw-item">
                <span className="fw-code code-s">N6</span>
                <div>
                  <div className="fw-name">Binds the Board / Government</div>
                  <div className="fw-def">Governs the regulator or Central Government — there is no Data Fiduciary duty to automate.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-s">N7</span>
                <div>
                  <div className="fw-name">Legal / judicial process</div>
                  <div className="fw-def">Appeals, execution and mediation are run by counsel, not software.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-s">N8</span>
                <div>
                  <div className="fw-name">Duty on the Data Principal</div>
                  <div className="fw-def">The obligation falls on the individual, not the fiduciary.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-s">N9</span>
                <div>
                  <div className="fw-name">Reactive to an authority&apos;s request</div>
                  <div className="fw-def">Only fires when the Board / Government asks — the platform can support, not pre-empt.</div>
                </div>
              </div>
              <div className="fw-item">
                <span className="fw-code code-s">N10</span>
                <div>
                  <div className="fw-name">Definitional / scope only</div>
                  <div className="fw-def">Sets meaning or applicability — no operative duty to perform.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="sec-h">
          <h2>Rationale — Chapter by Chapter, Section by Section</h2>
          <div className="h-note">Each section status reflects live platform capability mapping.</div>
        </div>
        <div style={{ height: 18 }} />
        {data.chapters.map((chapter) => {
          const rows = sectionsByChapter.get(chapter.chapter) ?? [];
          const headClass = chapter.manual === 0 && chapter.partial === 0 && chapter.fully_automated === 0 ? 'inst' : '';
          return (
            <section key={chapter.chapter} className="chapter">
              <div className={`chapter-head ${headClass}`}>
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
                        <div className="r-why">{rationaleForSection(row)}</div>
                      </div>
                      <div className="r-status">
                        <span className={pill.className}>
                          <StatusIcon kind={pill.icon} />
                          {pill.label}
                        </span>
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
