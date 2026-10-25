import type { ReactElement } from 'react';
import { useState } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { SectionReference } from '@/app/components/common/SectionReference';

interface ConsentToggles {
  marketing: boolean;
  analytics: boolean;
  personalized: boolean;
}

/**
 * Side-by-side comparison of consent grant vs withdrawal UI parity per DPDPA Section 6(3).
 */
export function ConsentWithdrawalFlow(): ReactElement {
  const [grantConsents, setGrantConsents] = useState<ConsentToggles>({
    marketing: true,
    analytics: true,
    personalized: true,
  });
  const [withdrawConsents, setWithdrawConsents] = useState<ConsentToggles>({
    marketing: true,
    analytics: true,
    personalized: true,
  });

  return (
    <div className="p-8 max-w-[1280px] mx-auto text-foreground">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-foreground">Consent Grant vs Withdrawal Parity</h1>
          <button type="button" className="px-4 py-2 text-sm rounded-md border border-border hover:bg-secondary bg-card text-foreground">
            Export evidence pack
          </button>
        </div>
        <SectionReference section="DPDPA Section 6(3) — Withdrawal must be as easy as grant" />
      </div>

      <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)] rounded-lg p-4 mb-6">
        <div className="text-sm text-foreground">
          <strong>DPDPA Section 6(3) Requirement:</strong> Withdrawal of consent must be as easy as giving consent.
          ZeroShield enforces UI parity automatically to ensure compliance.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border-2 border-green-200 dark:border-green-900 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <CheckCircle className="size-6 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-green-900 dark:text-green-300">Grant Flow</h2>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold text-sm">
                  1
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">See consent notice</h3>
                <div className="bg-secondary border border-border rounded p-3 text-sm">
                  <div className="font-medium mb-2 text-foreground">Cookie Consent</div>
                  <div className="text-muted-foreground">
                    We use cookies to enhance your browsing experience and analyze our traffic.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="size-5 text-green-600 dark:text-green-400" />
            </div>

            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold text-sm">
                  2
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">Review purposes</h3>
                <div className="bg-secondary border border-border rounded p-3 space-y-2 text-foreground">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grantConsents.marketing}
                      onChange={(event) =>
                        setGrantConsents({ ...grantConsents, marketing: event.target.checked })
                      }
                    />
                    <span>Marketing emails</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grantConsents.analytics}
                      onChange={(event) =>
                        setGrantConsents({ ...grantConsents, analytics: event.target.checked })
                      }
                    />
                    <span>Analytics tracking</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grantConsents.personalized}
                      onChange={(event) =>
                        setGrantConsents({ ...grantConsents, personalized: event.target.checked })
                      }
                    />
                    <span>Personalized recommendations</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="size-5 text-green-600 dark:text-green-400" />
            </div>

            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold text-sm">
                  3
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">Grant consent</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGrantConsents({ marketing: true, analytics: true, personalized: true });
                      notify(
                        'All consents granted!\n\n✓ Marketing emails\n✓ Analytics tracking\n✓ Personalized recommendations',
                      );
                    }}
                    className="flex-1 px-4 py-2 rounded-md bg-green-600 text-white font-medium hover:bg-green-700"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={() => notify('Customize consent preferences...')}
                    className="flex-1 px-4 py-2 rounded-md border border-border bg-card text-foreground font-medium hover:bg-secondary"
                  >
                    Customize
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">✓ Single click to grant per purpose</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border-2 border-amber-200 dark:border-amber-900 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <CheckCircle className="size-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-300">Withdrawal Flow</h2>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-semibold text-sm">
                  1
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">Open Rights Portal</h3>
                <div className="bg-secondary border border-border rounded p-3 text-sm">
                  <div className="font-medium mb-2 text-foreground">Your Data Rights</div>
                  <div className="text-muted-foreground">Exercise your right to withdraw consent at any time</div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="size-5 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-semibold text-sm">
                  2
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">Choose Withdraw Consent</h3>
                <div className="bg-secondary border border-border rounded p-3 space-y-2 text-foreground">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withdrawConsents.marketing}
                      onChange={(event) =>
                        setWithdrawConsents({ ...withdrawConsents, marketing: event.target.checked })
                      }
                    />
                    <span>Marketing emails</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withdrawConsents.analytics}
                      onChange={(event) =>
                        setWithdrawConsents({ ...withdrawConsents, analytics: event.target.checked })
                      }
                    />
                    <span>Analytics tracking</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withdrawConsents.personalized}
                      onChange={(event) =>
                        setWithdrawConsents({ ...withdrawConsents, personalized: event.target.checked })
                      }
                    />
                    <span>Personalized recommendations</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="size-5 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="size-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-semibold text-sm">
                  3
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-medium mb-2 text-foreground">Withdraw consent</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawConsents({ marketing: false, analytics: false, personalized: false });
                      notify(
                        'All consents withdrawn!\n\n✗ Marketing emails - WITHDRAWN\n✗ Analytics tracking - WITHDRAWN\n✗ Personalized recommendations - WITHDRAWN\n\nYour preferences will be processed within 24 hours.',
                      );
                    }}
                    className="flex-1 px-4 py-2 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700"
                  >
                    Withdraw all
                  </button>
                  <button
                    type="button"
                    onClick={() => notify('Customize withdrawal preferences...')}
                    className="flex-1 px-4 py-2 rounded-md border border-border bg-card text-foreground font-medium hover:bg-secondary"
                  >
                    Customize
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">✓ Single click to withdraw per purpose</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-card rounded-lg border border-border p-6">
        <h3 className="font-medium mb-4 text-foreground">UI Parity Features (Automatically Enforced)</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { title: '✓ Same number of steps', desc: 'Both flows require exactly 3 steps' },
            { title: '✓ Same granularity', desc: 'Same per-purpose toggles in both flows' },
            { title: '✓ Single-click action', desc: 'Both support "All" or "Specific" in one click' },
            { title: '✓ No friction', desc: 'No additional verification for withdrawal' },
            { title: '✓ Immediate effect', desc: 'Withdrawal processed within 24 hours' },
            { title: '✓ Same accessibility', desc: 'Both flows WCAG 2.1 AA compliant' },
          ].map((feature) => (
            <div key={feature.title} className="p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900">
              <div className="font-medium text-green-900 dark:text-green-400 mb-2">{feature.title}</div>
              <div className="text-sm text-green-700 dark:text-green-300">{feature.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
