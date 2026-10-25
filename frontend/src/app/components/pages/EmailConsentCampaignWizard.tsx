import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Upload, Users, X, Mail, Smartphone, Shield, Sparkles } from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { emailCampaignApi, type RecipientContact } from '@/lib/api/emailCampaign';
import { noticeDeliveryApi, type NoticeDeliveryProvider } from '@/lib/api/noticeDelivery';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchAssets, fetchAsset } from '@/lib/api/dataInventory';
import type { InventoryAsset } from '@/types/dataInventory';
import type { NoticeSummary } from '@/types/consent';
import type { Property } from '@/types/integrations';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: 'Basics & Notice' },
  { id: 2, label: 'Recipients' },
  { id: 3, label: 'Channel & Providers' },
  { id: 4, label: 'Review' },
  { id: 5, label: 'Confirm' },
];

type RecipientSourceTab = 'known_contacts' | 'csv_upload' | 'data_asset';

interface Props {
  notices: NoticeSummary[];
  onClose: () => void;
  onCreated: () => void;
}

export function EmailConsentCampaignWizard({ notices, onClose, onCreated }: Props): ReactElement {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [noticeId, setNoticeId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [providers, setProviders] = useState<NoticeDeliveryProvider[]>([]);

  // Channel & provider options
  const [deliveryStrategy, setDeliveryStrategy] = useState<'email_only' | 'sms_only' | 'fallback'>('fallback');
  const [selectedProviderId, setSelectedProviderId] = useState('');

  const [recipientTab, setRecipientTab] = useState<RecipientSourceTab>('known_contacts');
  const [segment, setSegment] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [contacts, setContacts] = useState<RecipientContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadHeaders, setUploadHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({ email: '', name: '', phone: '' });
  const [previewRows, setPreviewRows] = useState<RecipientContact[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [assetFields, setAssetFields] = useState<{ id: string; name: string; pii_category?: string | null }[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    integrationsApi.listProperties().then(setProperties).catch(() => notify('Could not load properties'));
    fetchAssets().then(setAssets).catch(() => undefined);
    noticeDeliveryApi.fetchProviders().then(setProviders).catch(() => undefined);
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const rows = await emailCampaignApi.searchRecipients(searchQ || undefined, segment, noticeId || undefined);
      setContacts(rows);
    } catch {
      notify('Could not load contacts');
    } finally {
      setLoadingContacts(false);
    }
  }, [searchQ, segment, noticeId]);

  useEffect(() => {
    if (recipientTab === 'known_contacts' && step === 2) {
      void loadContacts();
    }
  }, [recipientTab, step, loadContacts]);

  useEffect(() => {
    if (!assetId) {
      setAssetFields([]);
      return;
    }
    const asset = assets.find((a) => a.id === assetId);
    if (asset) {
      fetchAsset(assetId).then((detail) => {
        setAssetFields(
          detail.fields.map((f) => ({ id: f.id, name: f.name, pii_category: f.pii_category })),
        );
        const emailField = detail.fields.find((f) => f.pii_category === 'email');
        const nameField = detail.fields.find((f) => f.pii_category === 'name');
        const phoneField = detail.fields.find((f) => f.pii_category === 'phone');
        setFieldMap({
          email: emailField?.name ?? '',
          name: nameField?.name ?? '',
          phone: phoneField?.name ?? '',
        });
      });
    }
  }, [assetId, assets]);

  const resolvedRecipients = useMemo(() => {
    if (recipientTab === 'known_contacts') {
      return contacts.filter((c) => selectedIds.has(c.id));
    }
    return previewRows;
  }, [recipientTab, contacts, selectedIds, previewRows]);

  const canProceed = (): boolean => {
    if (step === 1) return Boolean(name.trim() && noticeId && propertyId);
    if (step === 2) return resolvedRecipients.length > 0;
    if (step === 3) return true;
    if (step === 4) return true;
    return true;
  };

  const handleUpload = async (file: File) => {
    try {
      const uploaded = await emailCampaignApi.uploadRecipients(file);
      setUploadId(uploaded.id);
      setUploadHeaders(uploaded.column_headers);
      const emailCol = uploaded.column_headers.find((h) => /email/i.test(h)) ?? '';
      const nameCol = uploaded.column_headers.find((h) => /name/i.test(h)) ?? '';
      const phoneCol = uploaded.column_headers.find((h) => /phone|mobile/i.test(h)) ?? '';
      setFieldMap({ email: emailCol, name: nameCol, phone: phoneCol });
      notify('File uploaded — map columns next');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const applyCsvMapping = async () => {
    if (!uploadId) return;
    try {
      await emailCampaignApi.mapUpload(uploadId, fieldMap);
      const preview = await emailCampaignApi.previewUpload(uploadId);
      setPreviewRows(preview.preview);
      setPreviewTotal(preview.total);
      setWarnings(preview.warnings);
      setSelectedIds(new Set(preview.preview.map((r) => r.id)));
      notify('Recipient list updated');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Mapping failed');
    }
  };

  const previewAssetRecipients = async () => {
    if (!assetId) return;
    try {
      const preview = await emailCampaignApi.previewDataAsset(assetId, fieldMap);
      setPreviewRows(preview.preview);
      setPreviewTotal(preview.total);
      setWarnings(preview.warnings);
      setSelectedIds(new Set(preview.preview.map((r) => r.id)));
      notify('Data asset preview loaded');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Data asset preview failed');
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const recipientSnapshot = resolvedRecipients.map((r) => ({
        recipient_id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
      }));

      await noticeDeliveryApi.createCampaign({
        name,
        notice_id: noticeId,
        property_id: propertyId,
        campaign_purpose: 'consent_capture',
        delivery_strategy: deliveryStrategy,
        fallback_chain: deliveryStrategy === 'fallback' ? ['email', 'sms'] : [deliveryStrategy.replace('_only', '')],
        recipient_segment: segment,
        recipient_source: recipientTab,
        recipient_source_config: { upload_id: uploadId, asset_id: assetId, provider_id: selectedProviderId },
        recipient_snapshot: recipientSnapshot,
        schedule_type: 'immediate',
        schedule_config: {},
        retry_policy: { max_attempts: 3, backoff_seconds: 300, timeout_seconds: 30 },
      } as Parameters<typeof noticeDeliveryApi.createCampaign>[0]);

      notify('Consent Campaign created successfully!');
      onCreated();
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create campaign');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex max-h-[90vh]">
        {/* Sidebar steps */}
        <aside className="w-56 border-r border-[var(--border-default)] bg-[var(--surface-raised)] p-5 shrink-0 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1 text-[var(--brand-primary)]">
              <Shield className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wider">Consent Campaign</p>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">DPDPA §6(10) Multi-channel OTP Capture</p>
          </div>

          <div className="space-y-1">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all',
                  step === s.id
                    ? 'bg-[var(--brand-primary)] text-white shadow-md'
                    : step > s.id
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                      : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5',
                )}
              >
                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
                  {s.id}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        </aside>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-5 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--surface-raised)]">
            <div>
              <h3 className="font-bold text-[var(--text-primary)]">Step {step}: {STEPS[step - 1]?.label}</h3>
              <p className="text-xs text-[var(--text-secondary)]">Configure your DPDPA consent campaign and notice delivery.</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <label className="block text-sm font-medium">
                  <span className="text-[var(--text-primary)]">Campaign Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm"
                    placeholder="e.g. Q3 Customer DPDPA Re-Notice & Consent Capture"
                  />
                </label>
                <label className="block text-sm font-medium">
                  <span className="text-[var(--text-primary)]">Select Consent Notice</span>
                  <select
                    value={noticeId}
                    onChange={(e) => setNoticeId(e.target.value)}
                    className="mt-1.5 w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm"
                  >
                    <option value="">Select an approved DPDPA notice…</option>
                    {notices.map((n) => (
                      <option key={n.id} value={n.id}>{n.display_name ?? n.internal_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  <span className="text-[var(--text-primary)] font-semibold">Integration Property</span>
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="mt-1.5 w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm"
                  >
                    <option value="">Select property context…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name || p.domain}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex gap-2 border-b border-[var(--border-default)] pb-3">
                  {([
                    ['known_contacts', 'Known Contacts', Users],
                    ['csv_upload', 'CSV / Excel Upload', Upload],
                    ['data_asset', 'Data Inventory Asset', Database],
                  ] as const).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRecipientTab(id)}
                      className={cn(
                        'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all',
                        recipientTab === id
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shadow-sm'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5',
                      )}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>

                {recipientTab === 'known_contacts' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder="Search name, email, or phone…"
                        className="flex-1 border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm bg-[var(--surface-base)]"
                      />
                      <select
                        value={segment}
                        onChange={(e) => setSegment(e.target.value)}
                        className="border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm bg-[var(--surface-base)]"
                      >
                        <option value="all">All Segment</option>
                        <option value="marketing">Marketing Opt-ins</option>
                        <option value="renewal_due">Renewal Due</option>
                        <option value="legacy_pre_dpdpa">Legacy Pre-DPDPA</option>
                      </select>
                      <button type="button" onClick={() => void loadContacts()} className="px-4 py-2 text-xs font-bold border rounded-xl bg-[var(--surface-raised)]">
                        Filter
                      </button>
                    </div>
                    <div className="border border-[var(--border-default)] rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--surface-raised)] sticky top-0 border-b border-[var(--border-default)] text-[var(--text-tertiary)]">
                          <tr>
                            <th className="p-2.5 w-8" />
                            <th className="p-2.5 text-left">Name</th>
                            <th className="p-2.5 text-left">Email / Phone</th>
                            <th className="p-2.5 text-left">Last Consent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-default)]">
                          {loadingContacts ? (
                            <tr><td colSpan={4} className="p-4 text-center text-[var(--text-secondary)]">Loading contacts…</td></tr>
                          ) : contacts.length === 0 ? (
                            <tr><td colSpan={4} className="p-4 text-center text-[var(--text-tertiary)]">No contacts found in segment</td></tr>
                          ) : (
                            contacts.map((c) => (
                              <tr key={c.id} className="hover:bg-black/5 dark:hover:bg-white/5">
                                <td className="p-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(c.id)}
                                    onChange={(e) => {
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(c.id);
                                        else next.delete(c.id);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-2.5 font-medium">{c.name}</td>
                                <td className="p-2.5 text-[var(--text-secondary)]">{c.email || c.phone || '—'}</td>
                                <td className="p-2.5 text-[var(--text-tertiary)]">{c.last_consent_at?.slice(0, 10) ?? '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">{selectedIds.size} recipients selected</p>
                  </div>
                )}

                {recipientTab === 'csv_upload' && (
                  <div className="space-y-4">
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && void handleUpload(e.target.files[0])} className="text-sm" />
                    {uploadId && (
                      <div className="grid grid-cols-3 gap-3 bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--border-default)]">
                        {(['email', 'name', 'phone'] as const).map((role) => (
                          <label key={role} className="text-xs block">
                            <span className="font-semibold capitalize text-[var(--text-secondary)]">{role} column</span>
                            <select
                              value={fieldMap[role]}
                              onChange={(e) => setFieldMap((m) => ({ ...m, [role]: e.target.value }))}
                              className="mt-1 w-full border rounded-lg px-2 py-1.5 text-xs bg-[var(--surface-base)]"
                            >
                              <option value="">— Select header —</option>
                              {uploadHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                    {uploadId && (
                      <button type="button" onClick={() => void applyCsvMapping()} className="text-xs font-bold px-4 py-2 bg-[var(--brand-primary)] text-white rounded-xl">
                        Validate & Preview Recipient List
                      </button>
                    )}
                  </div>
                )}

                {recipientTab === 'data_asset' && (
                  <div className="space-y-4">
                    <select
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                      className="w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 text-sm bg-[var(--surface-base)]"
                    >
                      <option value="">Select data asset…</option>
                      {assets.filter((a) => a.data_source_id).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-3 bg-[var(--surface-raised)] p-3 rounded-xl border border-[var(--border-default)]">
                      {(['email', 'name', 'phone'] as const).map((role) => (
                        <label key={role} className="text-xs block">
                          <span className="font-semibold capitalize text-[var(--text-secondary)]">{role} field</span>
                          <select
                            value={fieldMap[role]}
                            onChange={(e) => setFieldMap((m) => ({ ...m, [role]: e.target.value }))}
                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-xs bg-[var(--surface-base)]"
                          >
                            <option value="">— Select field —</option>
                            {assetFields.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    <button type="button" onClick={() => void previewAssetRecipients()} className="text-xs font-bold px-4 py-2 bg-[var(--brand-primary)] text-white rounded-xl">
                      Query & Preview Recipients
                    </button>
                  </div>
                )}

                {(previewTotal > 0 || selectedIds.size > 0) && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
                    <p className="font-bold">{recipientTab === 'known_contacts' ? selectedIds.size : previewTotal} recipients successfully mapped</p>
                    {warnings.slice(0, 3).map((w) => <p key={w} className="text-amber-600 dark:text-amber-400">{w}</p>)}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block font-semibold mb-2 text-[var(--text-primary)]">Select Delivery Strategy</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'fallback', label: 'Dual OTP (Email + SMS)', desc: 'Sends via email first, with SMS fallback capability', icon: Sparkles },
                      { id: 'email_only', label: 'Email OTP Only', desc: 'Direct notice & OTP sent to email address', icon: Mail },
                      { id: 'sms_only', label: 'SMS OTP Only', desc: 'Direct notice link & OTP sent via SMS', icon: Smartphone },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDeliveryStrategy(opt.id as any)}
                        className={cn(
                          'p-4 rounded-xl border text-left flex flex-col justify-between transition-all',
                          deliveryStrategy === opt.id
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shadow-sm'
                            : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:bg-black/5 dark:hover:bg-white/5',
                        )}
                      >
                        <div className="flex items-center gap-2 font-bold mb-1">
                          <opt.icon className="w-4 h-4" /> {opt.label}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1.5 text-[var(--text-primary)]">Delivery Provider Adapter</label>
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm"
                  >
                    <option value="">Default System Adapters (Amazon SES / Twilio SMS)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.provider_name} ({p.channel.toUpperCase()}) {p.is_active ? '— Active' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm">
                <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-2">
                  <div className="flex justify-between border-b border-[var(--border-default)] pb-2">
                    <span className="text-[var(--text-secondary)]">Campaign Name</span>
                    <span className="font-bold">{name}</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-default)] pb-2">
                    <span className="text-[var(--text-secondary)]">Target Recipients</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{resolvedRecipients.length} Data Principals</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-default)] pb-2">
                    <span className="text-[var(--text-secondary)]">Recipient Source</span>
                    <span className="font-mono text-xs uppercase">{recipientTab}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Delivery Strategy</span>
                    <span className="font-bold">{deliveryStrategy}</span>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="text-center py-6 space-y-3">
                <Shield className="w-12 h-12 text-[var(--brand-primary)] mx-auto" />
                <h4 className="font-bold text-base text-[var(--text-primary)]">Ready to Launch Consent Campaign?</h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                  This campaign will generate unique secure links for all target Data Principals. Each Data Principal will view the full DPDPA Notice and must verify via OTP before consent is recorded in the Proof Vault.
                </p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[var(--border-default)] flex justify-between bg-[var(--surface-raised)]">
            <button
              type="button"
              onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
              className="px-4 py-2 text-xs font-bold border border-[var(--border-default)] rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <button
              type="button"
              disabled={!canProceed() || creating}
              onClick={() => {
                if (step === 5) void handleCreate();
                else setStep(step + 1);
              }}
              className="px-5 py-2 text-xs font-bold bg-[var(--brand-primary)] text-white rounded-xl disabled:opacity-50 shadow-md"
            >
              {step === 5 ? (creating ? 'Launching…' : 'Confirm & Launch Campaign') : 'Next Step'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
