import { notify } from '@/app/utils/notify';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { Check, Edit, AlertTriangle, Globe, X, Save, Loader2, Languages } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState, useEffect, useRef } from 'react';
import { fetchBanners, updateBanner, fetchNotices, updateNoticeVersion, translateText } from '@/lib/api/consent';
import type { ConsentBanner, NoticeSummary, NoticeVersion } from '@/types/consent';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';

interface LangConfig {
  name: string;
  native: string;
  code: string;
  supported: boolean;
}

const LANGUAGES: LangConfig[] = [
  { name: 'English', native: 'English', code: 'en', supported: true },
  { name: 'Hindi', native: 'हिन्दी', code: 'hi', supported: true },
  { name: 'Bengali', native: 'বাংলা', code: 'bn', supported: true },
  { name: 'Tamil', native: 'தமிழ்', code: 'ta', supported: true },
  { name: 'Telugu', native: 'తెలుగు', code: 'te', supported: true },
  { name: 'Marathi', native: 'मराठी', code: 'mr', supported: true },
  { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn', supported: true },
  { name: 'Malayalam', native: 'മലയാളം', code: 'ml', supported: true },
  { name: 'Gujarati', native: 'ગુજરાતી', code: 'gu', supported: true },
  { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pa', supported: true },
  { name: 'Urdu', native: 'اردو', code: 'ur', supported: true },
  { name: 'Odia', native: 'ଓଡ଼ିଆ', code: 'or', supported: true },
  { name: 'Assamese', native: 'অসমীয়া', code: 'as', supported: true },
  { name: 'Konkani', native: 'कोंकणी', code: 'kok', supported: true },
  { name: 'Nepali', native: 'नेपाली', code: 'ne', supported: true },
  { name: 'Sanskrit', native: 'संस्कृतम्', code: 'sa', supported: true },
  { name: 'Sindhi', native: 'سنڌي', code: 'sd', supported: true },
  { name: 'Bodo', native: "बर'", code: 'brx', supported: false },
  { name: 'Dogri', native: 'डोगरी', code: 'doi', supported: false },
  { name: 'Kashmiri', native: 'کٲशُر', code: 'ks', supported: false },
  { name: 'Maithili', native: 'मैथिली', code: 'mai', supported: false },
  { name: 'Manipuri', native: 'মৈতৈলোন', code: 'mni', supported: false },
  { name: 'Santali', native: 'ᱥᱟᱱᱛาᱲᱤ', code: 'sat', supported: false },
];

/**
 * Multi-language consent notice & banner editor with MyMemory translation support.
 */
export function MultiLanguageEditor(): ReactElement {
  const { user } = useAuth();
  const orgIdParam = getOrgIdParamForRole(user?.role);
  const [selectedLanguage, setSelectedLanguage] = useState<LangConfig>(LANGUAGES[1]!); // Hindi
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [editType, setEditType] = useState<'banner' | 'notice'>('banner');

  // Loaded data lists
  const [banners, setBanners] = useState<ConsentBanner[]>([]);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [selectedBanner, setSelectedBanner] = useState<ConsentBanner | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<NoticeSummary | null>(null);
  const [activeNoticeVersion, setActiveNoticeVersion] = useState<NoticeVersion | null>(null);

  // Loading states
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Current translation payload
  const [translationMap, setTranslationMap] = useState<Record<string, any>>({});
  const [selectedField, setSelectedField] = useState<string>('heading');
  const [targetText, setTargetText] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const targetTextRef = useRef(targetText);
  targetTextRef.current = targetText;

  useEffect(() => {
    async function loadData() {
      setLoadingLists(true);
      try {
        const [loadedBanners, loadedNotices] = await Promise.all([
          fetchBanners(orgIdParam),
          fetchNotices(orgIdParam),
        ]);
        setBanners(loadedBanners);
        setNotices(loadedNotices);
        
        if (loadedBanners.length > 0) {
          setSelectedBanner(loadedBanners[0]!);
          setTranslationMap(loadedBanners[0]!.translations || {});
        } else {
          setSelectedBanner(null);
        }
        if (loadedNotices.length > 0) {
          setSelectedNotice(loadedNotices[0]!);
        } else {
          setSelectedNotice(null);
        }
      } catch (e) {
        console.error('Failed to load translation targets:', e);
        notify('Failed to load banners or notices');
      } finally {
        setLoadingLists(false);
      }
    }
    void loadData();
  }, [orgIdParam, user?.role]);

  // Sync translation states when banner is selected
  useEffect(() => {
    if (editType === 'banner' && selectedBanner) {
      setTranslationMap(selectedBanner.translations || {});
      setSelectedField('heading');
    }
  }, [selectedBanner, editType]);

  // Sync translation states when notice is selected (must fetch full notice version details)
  useEffect(() => {
    if (editType === 'notice' && selectedNotice) {
      setSelectedField('opening_statement');
      if (selectedNotice.current_version_id) {
        setLoadingVersion(true);
        const { id, current_version_id } = selectedNotice;
        import('@/lib/api/consent').then(async ({ fetchNoticeVersion }) => {
          try {
            const versionDetails = await fetchNoticeVersion(id, current_version_id!, orgIdParam);
            setActiveNoticeVersion(versionDetails);
            setTranslationMap(versionDetails.translations || {});
          } catch (e) {
            console.error('Failed to load notice version:', e);
          } finally {
            setLoadingVersion(false);
          }
        });
      } else {
        setActiveNoticeVersion(null);
        setTranslationMap({});
      }
    }
  }, [selectedNotice, editType, orgIdParam]);


  const getSourceValue = () => {
    if (editType === 'banner' && selectedBanner) {
      return (selectedBanner as any)[selectedField] || '';
    }
    if (editType === 'notice' && activeNoticeVersion) {
      return (activeNoticeVersion as any)[selectedField] || '';
    }
    return '';
  };

  const getFieldsForType = () => {
    if (editType === 'banner') {
      return [
        { key: 'heading', label: 'Banner Heading' },
        { key: 'body_text', label: 'Banner Body' },
        { key: 'cta_accept', label: 'Accept Button' },
        { key: 'cta_reject', label: 'Reject Button' },
        { key: 'cta_customize', label: 'Customize Button' },
      ];
    }
    return [
      { key: 'display_name', label: 'Display Name' },
      { key: 'opening_statement', label: 'Opening Statement' },
      { key: 'rights_exercise', label: 'Rights Exercise Method' },
      { key: 'complaint_process', label: 'Complaint Process' },
      { key: 'retention_policy', label: 'Retention Policy Summary' },
    ];
  };

  const getLanguageStatus = (code: string) => {
    if (code === 'en') return 'complete';
    const langTrans = translationMap[code];
    if (!langTrans) return 'missing';

    const requiredFields = getFieldsForType().map(f => f.key);
    const completedFields = requiredFields.filter(f => Boolean(langTrans[f]));
    
    if (completedFields.length === requiredFields.length) {
      return 'complete';
    }
    if (completedFields.length > 0) {
      return 'draft';
    }
    return 'missing';
  };

  const getLanguageCoverage = (code: string) => {
    if (code === 'en') return 100;
    const langTrans = translationMap[code];
    if (!langTrans) return 0;
    const requiredFields = getFieldsForType().map(f => f.key);
    const completedFields = requiredFields.filter(f => Boolean(langTrans[f]));
    return Math.round((completedFields.length / requiredFields.length) * 100);
  };

  const getFieldTranslationStatus = (code: string) => {
    const fields = getFieldsForType();
    if (code === 'en') {
      return fields.map((f) => ({ ...f, done: true }));
    }
    const langTrans = translationMap[code] || {};
    return fields.map((f) => ({
      ...f,
      done: Boolean(langTrans[f.key]),
    }));
  };

  const handleTranslateText = async (text: string, targetLangCode: string) => {
    if (!text.trim()) return '';
    setIsTranslating(true);
    try {
      const data = await translateText(text.trim(), targetLangCode, orgIdParam);
      if (data?.translatedText) {
        return data.translatedText;
      }
    } catch (err) {
      console.warn(`Translation via proxy failed:`, err);
    } finally {
      setIsTranslating(false);
    }
  };

  /** Persist the current field draft into translationMap so switching fields doesn't lose work. */
  const commitFieldDraft = (
    field: string,
    text: string,
    verified: boolean,
    baseMap?: Record<string, any>,
  ): Record<string, any> => {
    const langCode = selectedLanguage.code;
    const prev = baseMap ?? translationMap;
    const currentLangTrans = { ...(prev[langCode] || {}) };
    const trimmed = text.trim();
    if (trimmed) {
      currentLangTrans[field] = trimmed;
    } else {
      delete currentLangTrans[field];
    }
    let verifiedFields = [...(currentLangTrans.verified_fields || [])];
    if (verified) {
      if (!verifiedFields.includes(field)) verifiedFields.push(field);
    } else {
      verifiedFields = verifiedFields.filter((f: string) => f !== field);
    }
    currentLangTrans.verified_fields = verifiedFields;
    return {
      ...prev,
      [langCode]: currentLangTrans,
    };
  };

  const selectSourceField = (nextField: string) => {
    if (nextField === selectedField) return;
    const nextMap = commitFieldDraft(selectedField, targetText, isVerified);
    setTranslationMap(nextMap);
    setSelectedField(nextField);
  };

  // Sync editor inputs from the staged map when language/field/map changes
  useEffect(() => {
    const langCode = selectedLanguage.code;
    const currentLangTrans = translationMap[langCode] || {};
    setTargetText(currentLangTrans[selectedField] || '');
    setIsVerified(currentLangTrans.verified_fields?.includes(selectedField) || false);
  }, [selectedLanguage.code, selectedField, translationMap]);

  // Auto-translate empty fields when the modal opens (staged into map on success)
  useEffect(() => {
    if (!showTranslateModal) return;
    const langCode = selectedLanguage.code;
    if (langCode === 'en') return;
    const existing = translationMap[langCode]?.[selectedField];
    if (existing) return;

    const source = getSourceValue();
    if (!source?.trim()) return;

    let cancelled = false;
    void (async () => {
      setIsTranslating(true);
      const translated = await handleTranslateText(source, langCode);
      if (cancelled || !translated) {
        if (!cancelled) setIsTranslating(false);
        return;
      }
      // Don't clobber a draft the user already typed, or a field staged meanwhile
      if (targetTextRef.current.trim()) {
        setIsTranslating(false);
        return;
      }
      setTranslationMap((prev) => {
        const current = { ...(prev[langCode] || {}) };
        if (current[selectedField]) return prev;
        current[selectedField] = translated;
        return { ...prev, [langCode]: current };
      });
      setIsTranslating(false);
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit translationMap — staging must not re-trigger auto-translate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage.code, selectedField, showTranslateModal]);

  const triggerTranslation = async () => {
    const source = getSourceValue();
    if (!source) {
      notify('Source text is empty');
      return;
    }
    notify(`Translating to ${selectedLanguage.name}...`);
    const translated = await handleTranslateText(source, selectedLanguage.code);
    if (translated) {
      setTargetText(translated);
      setTranslationMap(commitFieldDraft(selectedField, translated, isVerified));
      notify('Translation completed');
    } else {
      notify('Translation API failed. Falling back to local mapping or manual entry.');
    }
  };

  const handleSaveField = () => {
    // Commit the active field, then persist the full map (all staged fields)
    const nextMap = commitFieldDraft(selectedField, targetText, isVerified);
    setTranslationMap(nextMap);
    setShowTranslateModal(false);
    void persistToDatabase(nextMap);
  };

  const persistToDatabase = async (customMap?: Record<string, any>) => {
    setIsSaving(true);
    const mapToSave = customMap || translationMap;
    try {
      if (editType === 'banner' && selectedBanner) {
        const payload: any = {
          name: selectedBanner.name,
          version: selectedBanner.version,
          status: selectedBanner.status,
          deployed_on: selectedBanner.deployed_on,
          languages: selectedBanner.languages,
          purposes: selectedBanner.purposes,
          description: selectedBanner.description,
          display_style: selectedBanner.display_style,
          position: selectedBanner.position,
          theme: selectedBanner.theme,
          template: selectedBanner.template,
          heading: selectedBanner.heading,
          body_text: selectedBanner.body_text,
          cta_accept: selectedBanner.cta_accept,
          cta_reject: selectedBanner.cta_reject,
          cta_customize: selectedBanner.cta_customize,
          privacy_policy_url: selectedBanner.privacy_policy_url,
          cookie_policy_url: selectedBanner.cookie_policy_url,
          dpo_email: selectedBanner.dpo_email,
          show_language_switcher: selectedBanner.show_language_switcher,
          ab_test_enabled: selectedBanner.ab_test_enabled,
          ab_variant_theme: selectedBanner.ab_variant_theme,
          ab_traffic_split: selectedBanner.ab_traffic_split,
          ab_test_duration_days: selectedBanner.ab_test_duration_days,
          custom_css: selectedBanner.custom_css,
          properties: selectedBanner.properties,
          language_detection_settings: selectedBanner.language_detection_settings,
          translations: mapToSave,
          consent_notice_id: selectedBanner.consent_notice_id,
        };
        const updated = await updateBanner(selectedBanner.id, payload, orgIdParam);
        setSelectedBanner(updated);
        setBanners(banners.map(b => b.id === updated.id ? updated : b));
        notify('Translations saved successfully!');
      } else if (editType === 'notice' && selectedNotice && activeNoticeVersion) {
        const payload = {
          display_name: activeNoticeVersion.display_name,
          language: activeNoticeVersion.language,
          opening_statement: activeNoticeVersion.opening_statement,
          contact_email: activeNoticeVersion.contact_email || undefined,
          contact_website: activeNoticeVersion.contact_website || undefined,
          dpo_name: activeNoticeVersion.dpo_name || undefined,
          dpo_email: activeNoticeVersion.dpo_email || undefined,
          rights_exercise: activeNoticeVersion.rights_exercise,
          complaint_process: activeNoticeVersion.complaint_process,
          retention_policy: activeNoticeVersion.retention_policy,
          translations: mapToSave,
        };
        const updated = await updateNoticeVersion(selectedNotice.id, activeNoticeVersion.id, payload, orgIdParam);
        setActiveNoticeVersion(updated);
        setTranslationMap(updated.translations || {});
        setNotices(notices.map(n => n.id === selectedNotice.id ? { ...n } : n));
        notify('Translations saved successfully!');
      } else {
        notify('No active context selected.');
      }
    } catch (e) {
      console.error('Failed to persist translation:', e);
      notify('Error saving translations to database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-[1280px] mx-auto text-foreground">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="mb-2 text-foreground flex items-center gap-2">
              <Languages className="size-8 text-indigo-600" />
              Multi-Language Editor
            </h1>
            <div className="flex items-center gap-3">
              <DPDPAChip
                sections={{
                  chapter: 2,
                  section: 5,
                  subsection: 3,
                  name: 'Eighth Schedule languages',
                  url: '/dpdpa2023/chapter-2/section5.html',
                  excerpt: 'Notice in language preferences including all 22 Eighth Schedule languages...',
                }}
                size="detailed"
              />
              <PenaltyChip amount={150} />
            </div>
          </div>
          
          <button
            type="button"
            disabled={isSaving}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
            onClick={persistToDatabase}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Translation Pack
          </button>
        </div>
        <SectionReference section="DPDPA Section 5 — Notice in Data Principal's Preferred Language" />
      </div>

      <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)] rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-foreground">
          <Globe className="size-5 text-[var(--status-info)]" />
          <div className="text-sm font-medium">
            DPDPA Section 5 requires notices in data principal's preferred language including all 22 Eighth Schedule languages.
          </div>
        </div>
      </div>

      {/* Target Selector Bar */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Select Component:</span>
          <div className="flex bg-secondary p-1 rounded-lg">
            <button
              onClick={() => setEditType('banner')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                editType === 'banner' ? 'bg-indigo-600 text-white' : 'text-muted-foreground'
              }`}
            >
              Consent Banner UI
            </button>
            <button
              onClick={() => setEditType('notice')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                editType === 'notice' ? 'bg-indigo-600 text-white' : 'text-muted-foreground'
              }`}
            >
              Consent Notice
            </button>
          </div>

          {loadingLists ? (
            <span className="text-xs text-muted-foreground animate-pulse">Loading data...</span>
          ) : editType === 'banner' ? (
            <select
              value={selectedBanner?.id || ''}
              onChange={(e) => {
                const b = banners.find(x => x.id === e.target.value);
                if (b) setSelectedBanner(b);
              }}
              className="px-3 py-1.5 text-xs border border-border bg-secondary text-foreground rounded-md outline-none"
            >
              {banners.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.version})</option>
              ))}
            </select>
          ) : (
            <select
              value={selectedNotice?.id || ''}
              onChange={(e) => {
                const n = notices.find(x => x.id === e.target.value);
                if (n) setSelectedNotice(n);
              }}
              className="px-3 py-1.5 text-xs border border-border bg-secondary text-foreground rounded-md outline-none"
            >
              {notices.map(n => (
                <option key={n.id} value={n.id}>{n.internal_name} ({n.version_label})</option>
              ))}
            </select>
          )}
        </div>

        {editType === 'notice' && loadingVersion && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading Notice Version Details...</span>
        )}
      </div>

      {/* Language Coverage */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-foreground">Language Coverage</h3>
          <span className="text-xs text-muted-foreground">
            Click a supported language card to translate/verify fields. Grayed out languages are currently unsupported.
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const status = getLanguageStatus(lang.code);
            const coverage = getLanguageCoverage(lang.code);
            
            return (
              <div
                key={lang.name}
                onClick={() => {
                  if (!lang.supported) return;
                  setSelectedLanguage(lang);
                  setShowTranslateModal(true);
                }}
                className={`px-3 py-2 rounded-lg border-2 transition-all duration-200 select-none ${
                  !lang.supported
                    ? 'border-gray-200 bg-gray-50/50 dark:border-gray-800/50 dark:bg-gray-950/20 opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-md ' + (
                      status === 'complete'
                        ? 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20'
                        : status === 'draft'
                        ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/20'
                        : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                    )
                }`}
                title={!lang.supported ? `${lang.name} is currently unsupported by the automatic Translation Memory` : undefined}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground">{lang.native}</span>
                  {lang.supported && (
                    <>
                      {status === 'complete' && <Check className="size-4 text-green-600 dark:text-green-400" />}
                      {status === 'draft' && <Edit className="size-4 text-yellow-600 dark:text-yellow-400" />}
                      {status === 'missing' && <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {!lang.supported ? (
                    'Unsupported'
                  ) : (
                    (() => {
                      const fields = getFieldTranslationStatus(lang.code);
                      const done = fields.filter((f) => f.done).length;
                      const total = fields.length;
                      if (status === 'complete') return `✓ ${done}/${total} · ${coverage}%`;
                      if (status === 'draft') return `✏ ${done}/${total} · ${coverage}%`;
                      return `⚠ 0/${total} Missing`;
                    })()
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side Editor (Live Preview for Selected Language) */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-card rounded-lg border border-border p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-muted-foreground">Source (English)</span>
              <select
                value={selectedField}
                onChange={(e) => selectSourceField(e.target.value)}
                className="px-2 py-1 text-xs border border-border bg-secondary text-foreground rounded-md"
              >
                {getFieldsForType().map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="bg-secondary border border-border rounded p-4 text-sm text-foreground min-h-[110px]">
              {getSourceValue() || <span className="text-muted-foreground italic">No text provided.</span>}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-muted-foreground">Target ({selectedLanguage.name})</span>
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded font-mono">
                {selectedLanguage.code}
              </span>
            </div>
            <textarea
              className="w-full px-3 py-2 border border-border bg-secondary text-foreground rounded-md resize-none text-sm outline-none focus:border-indigo-600"
              rows={4}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder={`Enter ${selectedLanguage.name} translation...`}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={triggerTranslation}
              disabled={isTranslating}
              className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {isTranslating ? <Loader2 className="size-4 animate-spin" /> : null}
              ✨ Translate
            </button>
            
            <div className="flex gap-3 items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
                <input
                  type="checkbox"
                  checked={isVerified}
                  onChange={(e) => setIsVerified(e.target.checked)}
                  className="rounded accent-indigo-600"
                />
                <span className="text-muted-foreground text-xs">Verified by legal team</span>
              </label>
              <button
                onClick={handleSaveField}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold"
              >
                Apply Local
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Translation Modal */}
      {showTranslateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTranslateModal(false)}>
          <div className="bg-card rounded-lg p-6 max-w-3xl w-full m-4 max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <Languages className="size-6 text-indigo-600" />
                Translate to {selectedLanguage.name}
              </h2>
              <button onClick={() => setShowTranslateModal(false)} className="p-1 hover:bg-secondary rounded text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Source Fields (English)</div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {getFieldTranslationStatus(selectedLanguage.code).map((f) => (
                      <div
                        key={f.key}
                        onClick={() => selectSourceField(f.key)}
                        className={`p-3 rounded border text-xs cursor-pointer select-none transition-all ${
                          selectedField === f.key
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/20'
                            : f.done
                            ? 'border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/10 hover:border-green-400'
                            : 'border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10 hover:border-amber-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="font-semibold">{f.label}</div>
                          {f.done ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 shrink-0">
                              <Check className="size-3" /> Done
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                              <AlertTriangle className="size-3" /> Remaining
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground line-clamp-2">
                          {(editType === 'banner' ? (selectedBanner as any)?.[f.key] : (activeNoticeVersion as any)?.[f.key]) || 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Translation Input (Read-Only)</div>
                    <textarea
                      className="w-full px-2.5 py-1.5 border border-border bg-gray-100 dark:bg-secondary/35 text-muted-foreground rounded-md resize-none h-20 text-xs outline-none cursor-not-allowed"
                      value={getSourceValue()}
                      readOnly={true}
                      placeholder="No source text provided."
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={triggerTranslation}
                      disabled={isTranslating}
                      className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTranslating ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      ✨ Translate
                    </button>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer text-foreground">
                      <input
                        type="checkbox"
                        checked={isVerified}
                        onChange={(e) => setIsVerified(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                      <span className="text-muted-foreground">Verified by legal team</span>
                    </label>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Translation Output</div>
                    <textarea
                      className="w-full px-2.5 py-1.5 border border-border bg-secondary text-foreground rounded-md resize-none h-24 text-xs outline-none focus:border-indigo-600"
                      placeholder="Click Translate to generate translation or enter manually..."
                      value={targetText}
                      onChange={(e) => setTargetText(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {(() => {
                const fieldStatuses = getFieldTranslationStatus(selectedLanguage.code);
                const doneCount = fieldStatuses.filter((f) => f.done).length;
                const remaining = fieldStatuses.filter((f) => !f.done);
                const coverage = getLanguageCoverage(selectedLanguage.code);
                return (
                  <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)] rounded p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        Translation coverage for {selectedLanguage.name}:
                      </span>
                      <span className="font-semibold text-foreground whitespace-nowrap">
                        {doneCount}/{fieldStatuses.length} fields · {coverage}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          coverage === 100 ? 'bg-green-500' : coverage > 0 ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {fieldStatuses.map((f) => (
                        <li key={f.key}>
                          <button
                            type="button"
                            onClick={() => selectSourceField(f.key)}
                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors ${
                              selectedField === f.key
                                ? 'bg-indigo-100 dark:bg-indigo-950/40'
                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                          >
                            {f.done ? (
                              <Check className="size-3 text-green-600 dark:text-green-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            )}
                            <span className={f.done ? 'text-foreground' : 'text-amber-800 dark:text-amber-300'}>
                              {f.label}
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {f.done ? 'Done' : 'Remaining'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {remaining.length > 0 && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 pt-0.5">
                        Remaining: {remaining.map((f) => f.label).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={handleSaveField}
                  className="flex-1 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-semibold"
                >
                  Save Translations
                </button>
                <button
                  onClick={() => setShowTranslateModal(false)}
                  className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
