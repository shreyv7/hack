import type { ReactElement } from 'react';
import { Link } from 'react-router';
import {
  Check,
  Lock,
  Mail,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Settings,
  Truck,
  XCircle,
} from 'lucide-react';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { SectionReference } from '@/app/components/common/SectionReference';
import {
  ProviderCredentialFields,
} from '@/app/components/notice-delivery/ProviderCredentialFields';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { useNoticeDeliveryProviders } from '@/hooks/useNoticeDeliveryProviders';
import { cn } from '@/lib/utils';

export function PluggableProviderAdapters(): ReactElement {
  const org = useComplianceOrg();
  const {
    providers,
    autoConfig,
    loading,
    error,
    newProvider,
    setNewProvider,
    setChannel,
    createProvider,
    toggleProvider,
    testProvider,
    testingProviderId,
    testResult,
    reload,
  } = useNoticeDeliveryProviders(org.orgIdParam, org.hasOrg);

  return (
    <ConsentManagementGate
      title="Pluggable Provider Adapters"
      loading={org.loading || loading}
      error={org.error ?? error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 font-sans text-slate-900 dark:text-slate-100 relative selection:bg-indigo-500/30">
        <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
        <div className="max-w-[1280px] mx-auto p-8 space-y-8 relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-indigo-500/20 pb-8 gap-4">
            <div>
              <h1 className="text-4xl font-extrabold mb-3 text-slate-900 dark:text-white tracking-tight">
                Pluggable Provider Adapters
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed font-medium">
                Register delivery adapters and credentials once. Notice Delivery Channels, breach DP
                notifications, and consent campaigns use these settings automatically.
              </p>
              <div className="mt-4">
                <SectionReference section="DPDPA Sections 5 & 8 — Notice Delivery Adapters" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void reload()}
                className="p-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-all text-slate-700 dark:text-slate-300"
                title="Refresh adapters"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <Link
                to="/consent/channels"
                className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                Notice Delivery Channels →
              </Link>
            </div>
          </div>

          {autoConfig?.dispatch_ready ? (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-sm flex items-start gap-3">
              <Check className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-1">Dispatch-ready</span>
                Configured channels:{' '}
                {Object.entries(autoConfig.providers_by_channel)
                  .map(([channel, name]) => `${channel} (${name})`)
                  .join(', ')}
                . Breach Disclosure Wizard Step 3 and notice campaigns will use these adapters
                automatically.
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm">
              Add at least one active adapter with complete credentials (email, SMS, or physical mail)
              to enable automatic dispatch across the platform.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 p-6 md:p-8 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg space-y-6">
              <h3 className="font-extrabold text-lg text-slate-800 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-500" /> Register Provider Adapter
              </h3>
              <form onSubmit={createProvider} className="space-y-5">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
                    Target Channel
                  </label>
                  <select
                    value={newProvider.channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="physical">Physical Mail</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
                    Provider Adapter Name
                  </label>
                  <select
                    value={newProvider.provider_name}
                    onChange={(e) =>
                      setNewProvider({ ...newProvider, provider_name: e.target.value, config: {} })
                    }
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {newProvider.channel === 'email' && (
                      <>
                        <option value="Amazon SES">Amazon SES</option>
                        <option value="SMTP">SMTP (SendGrid / Resend / Custom)</option>
                        <option value="Firebase">Firebase Email</option>
                      </>
                    )}
                    {newProvider.channel === 'sms' && (
                      <>
                        <option value="Twilio">Twilio</option>
                        <option value="MSG91">MSG91</option>
                        <option value="Firebase">Firebase SMS</option>
                      </>
                    )}
                    {newProvider.channel === 'whatsapp' && (
                      <option value="Meta Business API">Meta Business API</option>
                    )}
                    {newProvider.channel === 'physical' && (
                      <option value="Shiprocket">Shiprocket</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                    Enter Provider Credentials
                  </label>
                  <div className="space-y-4 p-5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> All credential fields are stored encrypted at rest.
                    </p>
                    <ProviderCredentialFields provider={newProvider} onChange={setNewProvider} />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition-all"
                >
                  Save Configuration
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 p-6 md:p-8 rounded-2xl border border-white/20 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shadow-lg space-y-6">
              <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">
                Configured Provider Adapters
              </h3>
              {providers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No adapters registered yet. Save your first provider on the left.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:shadow-md transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {provider.channel === 'email' && <Mail className="w-5 h-5 text-blue-500" />}
                            {provider.channel === 'sms' && (
                              <MessageSquare className="w-5 h-5 text-green-500" />
                            )}
                            {provider.channel === 'whatsapp' && (
                              <Send className="w-5 h-5 text-emerald-500" />
                            )}
                            {provider.channel === 'physical' && (
                              <Truck className="w-5 h-5 text-orange-500" />
                            )}
                          </div>
                          <div>
                            <span className="block font-bold text-sm text-slate-800 dark:text-slate-100">
                              {provider.provider_name}
                            </span>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                              {provider.channel}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleProvider(provider)}
                          className={cn(
                            'px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider border transition-colors',
                            provider.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
                          )}
                        >
                          {provider.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700/50">
                        <div className="flex justify-between items-center gap-2">
                          <span
                            className={cn(
                              'font-medium',
                              provider.is_configured
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-300',
                            )}
                          >
                            {provider.is_configured ? 'Credentials complete' : 'Credentials incomplete'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void testProvider(provider.id)}
                            disabled={testingProviderId === provider.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg transition-colors disabled:opacity-50 border border-slate-200 dark:border-slate-700"
                          >
                            {testingProviderId === provider.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 text-indigo-500" />
                            )}
                            Test Connection
                          </button>
                        </div>

                        {testResult[provider.id] && (
                          <div
                            className={cn(
                              'p-2 rounded flex items-start gap-1.5 text-[10px] font-medium border',
                              testResult[provider.id].success
                                ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/20'
                                : 'bg-red-500/5 text-red-600 border-red-500/20',
                            )}
                          >
                            {testResult[provider.id].success ? (
                              <Check className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1">
                              <span className="font-bold">
                                {testResult[provider.id].success ? 'Success' : 'Failed'}:
                              </span>{' '}
                              {testResult[provider.id].message}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)]">
                          <Lock className="w-2.5 h-2.5" /> Secure credentials encrypted at rest
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p className="font-bold text-slate-700 dark:text-slate-300">Webhook endpoints</p>
                <div>
                  <strong>Amazon SES:</strong> /api/notice-delivery/webhooks/ses
                </div>
                <div>
                  <strong>Twilio:</strong> /api/notice-delivery/webhooks/twilio
                </div>
                <div>
                  <strong>Shiprocket:</strong> /api/notice-delivery/webhooks/shiprocket
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ConsentManagementGate>
  );
}
