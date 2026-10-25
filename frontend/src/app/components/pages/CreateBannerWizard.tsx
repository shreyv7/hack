import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import { useProperties } from '@/hooks/useProperties';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import {
  X, Shield, Palette, Type, CheckSquare, Globe, Settings, Lock,
  Check, Cookie, Mail, UserCog, Smartphone, Tablet,
  Monitor, Sparkles, AlertTriangle, Plus, ChevronRight,
  ChevronLeft, Save, Rocket, MapPin, HeartPulse, Fingerprint,
  Baby, BarChart3, Share2, Briefcase, PenLine,
} from 'lucide-react';
import { StatuteTextLink } from '@/app/components/common/SectionReference';
import { createBanner, fetchBanner, fetchBankingBannerPresets, testConsentWebhook, updateBanner } from '@/lib/api/consent';
import { fetchWorkspace } from '@/lib/api/workspace';
import { buildPublicPortalUrl } from '@/lib/dsar/portalSlug';
import { getCmpScriptUrl, getPublicApiBaseUrl } from '@/lib/integrationUrls';
import { integrationsApi } from '@/lib/api/integrations';
import { notify } from '@/app/utils/notify';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import { BannerInstallDocSection } from '@/app/components/pages/BannerInstallDocModal';
import { BANNER_PURPOSE_OPTIONS } from '@/lib/consent/bannerPurposeTypes';
import { cn } from '@/lib/utils';

export function getTemplateCSS(_template: string, themeColor: string): string {
  const primary = themeColor || '#4F46E5';
  
  return `
    /* Classic Template */
    .zs-tpl-classic {
      background: ${primary} !important;
      color: #ffffff !important;
      font-family: inherit;
    }
    .zs-tpl-classic .zs-cta-accept {
      background: #ffffff !important;
      color: #111827 !important;
    }
    .zs-tpl-classic .zs-cta-reject,
    .zs-tpl-classic .zs-cta-customize {
      background: rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
    }

    /* Liquid Glass Template */
    .zs-tpl-liquid-glass {
      background: rgba(255, 255, 255, 0.7) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255, 255, 255, 0.4) !important;
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.08) !important;
      color: #1f2937 !important;
    }
    .zs-tpl-liquid-glass .zs-heading {
      color: #111827 !important;
    }
    .zs-tpl-liquid-glass .zs-body-text {
      color: #4b5563 !important;
    }
    .zs-tpl-liquid-glass .zs-cta-accept {
      background: ${primary} !important;
      color: #ffffff !important;
    }
    .zs-tpl-liquid-glass .zs-cta-reject,
    .zs-tpl-liquid-glass .zs-cta-customize {
      background: rgba(0, 0, 0, 0.06) !important;
      color: #1f2937 !important;
    }

    /* Neon Cyber Template */
    .zs-tpl-neon-cyber {
      background: #090d16 !important;
      border: 2px solid ${primary} !important;
      box-shadow: 0 0 10px ${primary}, inset 0 0 8px ${primary} !important;
      color: #e2e8f0 !important;
      font-family: monospace !important;
    }
    .zs-tpl-neon-cyber .zs-heading {
      color: #ffffff !important;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .zs-tpl-neon-cyber .zs-cta-accept {
      background: ${primary} !important;
      color: #000000 !important;
      font-weight: bold !important;
      box-shadow: 0 0 6px ${primary} !important;
      text-transform: uppercase;
    }
    .zs-tpl-neon-cyber .zs-cta-reject,
    .zs-tpl-neon-cyber .zs-cta-customize {
      background: transparent !important;
      border: 1px solid ${primary} !important;
      color: ${primary} !important;
      text-transform: uppercase;
    }

    /* Minimalist Light Template */
    .zs-tpl-minimalist-light {
      background: #ffffff !important;
      border: 1px solid #e2e8f0 !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
      color: #334155 !important;
    }
    .zs-tpl-minimalist-light .zs-heading {
      color: #0f172a !important;
    }
    .zs-tpl-minimalist-light .zs-cta-accept {
      background: ${primary} !important;
      color: #ffffff !important;
    }
    .zs-tpl-minimalist-light .zs-cta-reject,
    .zs-tpl-minimalist-light .zs-cta-customize {
      background: #f1f5f9 !important;
      color: #475569 !important;
    }

    /* Minimalist Dark Template */
    .zs-tpl-minimalist-dark {
      background: #18181b !important;
      border: 1px solid #27272a !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25) !important;
      color: #d4d4d8 !important;
    }
    .zs-tpl-minimalist-dark .zs-heading {
      color: #ffffff !important;
    }
    .zs-tpl-minimalist-dark .zs-cta-accept {
      background: ${primary} !important;
      color: #ffffff !important;
    }
    .zs-tpl-minimalist-dark .zs-cta-reject,
    .zs-tpl-minimalist-dark .zs-cta-customize {
      background: #27272a !important;
      color: #e4e4e7 !important;
    }

    /* Modern Warm Template */
    .zs-tpl-modern-warm {
      background: #fafaf9 !important;
      border: 1px solid #e7e5e4 !important;
      color: #44403c !important;
    }
    .zs-tpl-modern-warm .zs-heading {
      font-family: Georgia, serif !important;
      color: #1c1917 !important;
    }
    .zs-tpl-modern-warm .zs-cta-btn {
      border-radius: 9999px !important;
    }
    .zs-tpl-modern-warm .zs-cta-accept {
      background: ${primary} !important;
      color: #ffffff !important;
    }
    .zs-tpl-modern-warm .zs-cta-reject,
    .zs-tpl-modern-warm .zs-cta-customize {
      background: #f5f5f4 !important;
      color: #57534e !important;
    }

    /* Ocean Breeze Template */
    .zs-tpl-ocean-breeze {
      background: linear-gradient(135deg, ${primary} 0%, #06b6d4 100%) !important;
      color: #ffffff !important;
    }
    .zs-tpl-ocean-breeze .zs-cta-btn {
      border-radius: 9999px !important;
    }
    .zs-tpl-ocean-breeze .zs-cta-accept {
      background: #ffffff !important;
      color: #0891b2 !important;
    }
    .zs-tpl-ocean-breeze .zs-cta-reject,
    .zs-tpl-ocean-breeze .zs-cta-customize {
      background: rgba(255, 255, 255, 0.2) !important;
      color: #ffffff !important;
    }

    /* Retro Amber Template */
    .zs-tpl-retro-amber {
      background: #000000 !important;
      border: 2px solid #fbbf24 !important;
      color: #fbbf24 !important;
      font-family: monospace !important;
    }
    .zs-tpl-retro-amber .zs-heading {
      color: #fbbf24 !important;
      font-weight: bold !important;
      text-transform: uppercase;
    }
    .zs-tpl-retro-amber .zs-cta-btn {
      border: 1px solid #fbbf24 !important;
      border-radius: 0px !important;
    }
    .zs-tpl-retro-amber .zs-cta-accept {
      background: #fbbf24 !important;
      color: #000000 !important;
    }
    .zs-tpl-retro-amber .zs-cta-reject,
    .zs-tpl-retro-amber .zs-cta-customize {
      background: #000000 !important;
      color: #fbbf24 !important;
    }

    /* Corporate Template */
    .zs-tpl-corporate {
      background: #f8fafc !important;
      border-left: 5px solid ${primary} !important;
      border-top: 1px solid #e2e8f0 !important;
      border-right: 1px solid #e2e8f0 !important;
      border-bottom: 1px solid #e2e8f0 !important;
      color: #1e293b !important;
    }
    .zs-tpl-corporate .zs-heading {
      font-weight: 800 !important;
      color: #0f172a !important;
    }
    .zs-tpl-corporate .zs-cta-btn {
      border-radius: 0px !important;
    }
    .zs-tpl-corporate .zs-cta-accept {
      background: ${primary} !important;
      color: #ffffff !important;
    }
    .zs-tpl-corporate .zs-cta-reject,
    .zs-tpl-corporate .zs-cta-customize {
      background: #e2e8f0 !important;
      color: #1e293b !important;
    }

    /* Aurora Glow Template */
    .zs-tpl-aurora {
      background: linear-gradient(135deg, ${primary} 0%, #db2777 50%, #7c3aed 100%) !important;
      background-size: 200% 200% !important;
      color: #ffffff !important;
      animation: auroraGlow 10s ease infinite !important;
    }
    .zs-tpl-aurora .zs-cta-btn {
      border-radius: 9999px !important;
      backdrop-filter: blur(4px);
    }
    .zs-tpl-aurora .zs-cta-accept {
      background: #ffffff !important;
      color: #7c3aed !important;
    }
    .zs-tpl-aurora .zs-cta-reject,
    .zs-tpl-aurora .zs-cta-customize {
      background: rgba(255, 255, 255, 0.25) !important;
      color: #ffffff !important;
    }

    @keyframes auroraGlow {
      0%{background-position:0% 50%}
      50%{background-position:100% 50%}
      100%{background-position:0% 50%}
    }
  `;
}

interface CreateBannerWizardProps {
  onClose: () => void;
  /** Opens technical integration for the published banner. */
  onNavigateToTechnicalIntegration?: (bannerId: string) => void;
  editingBannerId?: string;
}

/**
 * Wizard for creating and publishing consent banners.
 */
export function CreateBannerWizard({
  onClose,
  onNavigateToTechnicalIntegration,
  editingBannerId,
}: CreateBannerWizardProps): ReactElement {
  const { user } = useAuth();
  const { purposes: registeredPurposes, notices: registeredNotices } = useConsentManagement();
  const [consentNoticeId, setConsentNoticeId] = useState('');
  const MAX_CUSTOM_CSS_LENGTH = 2500;
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [bannerName, setBannerName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [bannerPurpose, setBannerPurpose] = useState<string[]>(['cookie']);
  const [customPurposeText, setCustomPurposeText] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [displayStyle, setDisplayStyle] = useState('banner');
  const [position, setPosition] = useState('bottom');
  const [theme, setTheme] = useState('#4F46E5');
  const [heading, setHeading] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [primaryCta, setPrimaryCta] = useState('Accept');
  const [secondaryCta, setSecondaryCta] = useState('Reject All');
  const [tertiaryCta, setTertiaryCta] = useState('Customize');
  const [ctaWithdraw, setCtaWithdraw] = useState('Withdraw Consent');
  const [showWithdrawAction, setShowWithdrawAction] = useState(false);
  const [isBankingOrg, setIsBankingOrg] = useState(false);
  const [bankingChannel, setBankingChannel] = useState('');
  const [bankingPresets, setBankingPresets] = useState<Record<string, Record<string, unknown>>>({});
  const [abTestStartedAt, setAbTestStartedAt] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Privacy links
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [cookiePolicyUrl, setCookiePolicyUrl] = useState('');
  const [dpoEmail, setDpoEmail] = useState('');
  // Language switcher
  const [showLanguageSwitcher, setShowLanguageSwitcher] = useState(true);
  const [detectBrowserLocale, setDetectBrowserLocale] = useState(true);
  const [detectGeoIP, setDetectGeoIP] = useState(true);
  const [persistUserChoice, setPersistUserChoice] = useState(true);
  // A/B Testing
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [abVariantTheme, setAbVariantTheme] = useState('#10B981');
  const [abVariantDisplayStyle, setAbVariantDisplayStyle] = useState('banner');
  const [abVariantPosition, setAbVariantPosition] = useState('bottom');
  const [abVariantTemplate, setAbVariantTemplate] = useState('classic');
  const [abVariantCustomCss, setAbVariantCustomCss] = useState('');
  const [previewVariant, setPreviewVariant] = useState<'A' | 'B'>('A');
  const [abTrafficSplit, setAbTrafficSplit] = useState(50);
  const [abTestDuration, setAbTestDuration] = useState(14);
  const [developerMode, setDeveloperMode] = useState(false);
  const [consentWebhookUrl, setConsentWebhookUrl] = useState('');
  const [consentValidDays, setConsentValidDays] = useState(365);
  const [isWebhookTesting, setIsWebhookTesting] = useState(false);
  const [customCss, setCustomCss] = useState('');
  const [template, setTemplate] = useState('classic');
  const [trackersList, setTrackersList] = useState<any[]>([]);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [fallbackCounts] = useState(() => ({
    necessary: `${Math.floor(Math.random() * 10) + 1}*`,
    functional: `${Math.floor(Math.random() * 10) + 1}*`,
    analytics: `${Math.floor(Math.random() * 10) + 1}*`,
    advertising: `${Math.floor(Math.random() * 10) + 1}*`,
    social: `${Math.floor(Math.random() * 10) + 1}*`,
  }));
  const customCssLength = customCss.length;
  const abVariantCustomCssLength = abVariantCustomCss.length;
  const isCustomCssTooLong = customCssLength > MAX_CUSTOM_CSS_LENGTH || (abTestEnabled && abVariantCustomCssLength > MAX_CUSTOM_CSS_LENGTH);

  const currentTheme = abTestEnabled && previewVariant === 'B' ? abVariantTheme : theme;
  const currentDisplayStyle = abTestEnabled && previewVariant === 'B' ? abVariantDisplayStyle : displayStyle;
  const currentPosition = abTestEnabled && previewVariant === 'B' ? abVariantPosition : position;
  const currentTemplate = abTestEnabled && previewVariant === 'B' ? abVariantTemplate : template;
  const currentCustomCss = abTestEnabled && previewVariant === 'B' ? abVariantCustomCss : customCss;


  const orgIdParam = getOrgIdParamForRole(user?.role);

  useEffect(() => {
    void (async () => {
      try {
        const ws = await fetchWorkspace(orgIdParam);
        const banking = ws?.primary_industry === 'Banking & Financial Services';
        setIsBankingOrg(banking);
        if (banking) {
          const presets = await fetchBankingBannerPresets(orgIdParam);
          setBankingPresets(presets.presets);
        }
      } catch {
        setIsBankingOrg(false);
      }
    })();
  }, [orgIdParam]);

  const applyBankingPreset = (channelKey: string) => {
    const preset = bankingPresets[channelKey];
    if (!preset) return;
    setBankingChannel(channelKey);
    setDisplayStyle(String(preset.display_style || 'banner'));
    setPosition(String(preset.position || 'bottom'));
    setPrimaryCta(String(preset.cta_accept || 'Accept'));
    setSecondaryCta(String(preset.cta_reject || 'Reject'));
    setTertiaryCta(String(preset.cta_customize || 'Manage Preferences'));
    setCtaWithdraw(String(preset.cta_withdraw || 'Withdraw Consent'));
    setShowWithdrawAction(Boolean(preset.show_withdraw_action));
    notify(`Applied ${String(preset.journey_label || channelKey)} preset`);
  };

  useEffect(() => {
    if (editingBannerId) {
      async function loadBanner() {
        try {
          const banner = await fetchBanner(editingBannerId!, orgIdParam);
          setBannerName(banner.name);
          setDescription(banner.description || '');
          setSelectedProperties(banner.properties || []);
          setDisplayStyle(banner.display_style || 'banner');
          setPosition(banner.position || 'bottom');
          setTheme(banner.theme || '#4F46E5');
          setHeading(banner.heading || '');
          setBodyText(banner.body_text || '');
          setPrimaryCta(banner.cta_accept || 'Accept');
          setSecondaryCta(banner.cta_reject || 'Reject All');
          setTertiaryCta(banner.cta_customize || 'Customize');
          setCtaWithdraw(banner.cta_withdraw || 'Withdraw Consent');
          setShowWithdrawAction(banner.show_withdraw_action ?? false);
          setAbTestStartedAt(banner.ab_test_started_at ?? null);
          setPrivacyPolicyUrl(banner.privacy_policy_url || '');
          setCookiePolicyUrl(banner.cookie_policy_url || '');
          setDpoEmail(banner.dpo_email || '');
          setShowLanguageSwitcher(banner.show_language_switcher ?? true);
          setAbTestEnabled(banner.ab_test_enabled ?? false);
          setAbVariantTheme(banner.ab_variant_theme || '#10B981');
          setAbVariantDisplayStyle(banner.ab_variant_display_style || 'banner');
          setAbVariantPosition(banner.ab_variant_position || 'bottom');
          setAbVariantTemplate(banner.ab_variant_template || 'classic');
          setAbVariantCustomCss(banner.ab_variant_custom_css || '');
          setAbTrafficSplit(banner.ab_traffic_split ?? 50);
          setAbTestDuration(banner.ab_test_duration_days ?? 14);
          setDeveloperMode(banner.developer_mode ?? false);
          setConsentWebhookUrl(banner.consent_webhook_url || '');
          setConsentValidDays(banner.consent_valid_days ?? 365);
          setCustomCss(banner.custom_css || '');
          setTemplate(banner.template || 'classic');
          setConsentNoticeId(banner.consent_notice_id || '');
          // Handle banner_purpose_type as list (from backend) or legacy string
          const rawPurpose = banner.banner_purpose_type;
          if (Array.isArray(rawPurpose) && rawPurpose.length > 0) {
            setBannerPurpose(rawPurpose);
          } else if (typeof rawPurpose === 'string') {
            try {
              const parsed = JSON.parse(rawPurpose);
              setBannerPurpose(Array.isArray(parsed) ? parsed : [rawPurpose]);
            } catch {
              setBannerPurpose([rawPurpose]);
            }
          } else {
            setBannerPurpose(['cookie']);
          }
          setCustomPurposeText(banner.banner_purpose_custom || '');

          if (banner.language_detection_settings) {
            try {
              const settings = typeof banner.language_detection_settings === 'string'
                ? JSON.parse(banner.language_detection_settings)
                : banner.language_detection_settings;
              setDetectBrowserLocale(settings.browser ?? true);
              setDetectGeoIP(settings.geoip ?? true);
              setPersistUserChoice(settings.user_choice ?? true);
            } catch (e) {
              console.error('Failed to parse language detection settings:', e);
            }
          }
        } catch (err) {
          console.error('Failed to load banner details:', err);
        }
      }
      void loadBanner();
    }
  }, [editingBannerId]);

  const handleSave = async (status: 'Draft' | 'Live', deploy = false) => {
    if (isCustomCssTooLong) {
      return;
    }

    if (bannerPurpose.length === 0) {
      notify('Please select at least one banner purpose');
      return;
    }

    if (bannerPurpose.includes('custom') && !customPurposeText.trim()) {
      notify('Please describe the custom banner purpose');
      return;
    }

    try {
      setIsSubmitting(true);
      const orgId = orgIdParam;
      const payload = {
        name: bannerName,
        status,
        version: 'v1.0',
        consents: 0,
        deployed_on: deploy
          ? [
              {
                type: bankingChannel || 'website',
                label:
                  (bankingPresets[bankingChannel]?.journey_label as string) ||
                  (bankingChannel ? bankingChannel.replace(/_/g, ' ') : 'Web'),
              },
            ]
          : [],
        languages: 22,
        purposes: bannerPurpose.length,
        description,
        banner_purpose_type: bannerPurpose,
        banner_purpose_custom: bannerPurpose.includes('custom') ? customPurposeText.trim() : null,
        display_style: displayStyle,
        position,
        theme,
        template,
        heading: heading || 'We value your privacy',
        body_text: bodyText || 'We use cookies and similar technologies to enhance your experience...',
        cta_accept: primaryCta,
        cta_reject: secondaryCta,
        cta_customize: tertiaryCta,
        cta_withdraw: ctaWithdraw,
        show_withdraw_action: showWithdrawAction,
        privacy_policy_url: privacyPolicyUrl || null,
        cookie_policy_url: cookiePolicyUrl || null,
        dpo_email: dpoEmail || null,
        show_language_switcher: showLanguageSwitcher,
        ab_test_enabled: abTestEnabled,
        ab_variant_theme: abTestEnabled ? abVariantTheme : null,
        ab_variant_display_style: abTestEnabled ? abVariantDisplayStyle : null,
        ab_variant_position: abTestEnabled ? abVariantPosition : null,
        ab_variant_template: abTestEnabled ? abVariantTemplate : null,
        ab_variant_custom_css: abTestEnabled ? abVariantCustomCss : null,
        ab_traffic_split: abTrafficSplit,
        ab_test_duration_days: abTestDuration,
        developer_mode: developerMode,
        consent_webhook_url: consentWebhookUrl.trim() || null,
        consent_valid_days: consentValidDays,
        custom_css: customCss || null,
        properties: selectedProperties,
        consent_notice_id: consentNoticeId || null,
        language_detection_settings: JSON.stringify({
          browser: detectBrowserLocale,
          geoip: detectGeoIP,
          user_choice: persistUserChoice,
        }),
      };

      const newBanner = editingBannerId
        ? await updateBanner(editingBannerId, payload, orgId)
        : await createBanner(payload, orgId);

      // Link the published banner to the selected properties
      if (deploy && selectedProperties.length > 0) {
        for (const domain of selectedProperties) {
          const matchedProp = fetchedProperties.find(p => p.domain === domain);
          if (matchedProp) {
            try {
              await integrationsApi.setPropertyBanner(matchedProp.id, newBanner.id, orgId);
            } catch (err) {
              console.error(`Failed to associate banner with property ${domain}:`, err);
            }
          }
        }
      }

      setShowPublishModal(false);
      onClose();
      if (deploy && onNavigateToTechnicalIntegration) {
        const firstProp = fetchedProperties.find(p => p.domain === selectedProperties[0]);
        onNavigateToTechnicalIntegration(firstProp ? firstProp.id : newBanner.id);
      }
    } catch (error) {
      console.error('Failed to create banner:', error);
      alert('Failed to save banner. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { number: 1, label: 'Basic Information', icon: Shield },
    { number: 2, label: 'Display Settings', icon: Palette },
    { number: 3, label: 'Content', icon: Type },
    { number: 4, label: 'Privacy Categories', icon: CheckSquare },
    { number: 5, label: 'Languages', icon: Globe },
    { number: 6, label: 'Advanced', icon: Settings },
  ];

  const { properties: fetchedProperties, isLoading: isPropertiesLoading } = useProperties();
  const properties = fetchedProperties.map((p) => p.domain);
  const activeProp = fetchedProperties.find(p => p.domain === selectedProperties[0]);

  const cmpScriptUrl = getCmpScriptUrl();
  const publicApiBase = getPublicApiBaseUrl();

  const developerInstallSnippet = `<script async src="${cmpScriptUrl}"
  data-property-id="${activeProp?.id || 'YOUR_PROPERTY_ID'}"
  data-api-key="YOUR_API_KEY"
  data-api-url="${publicApiBase}">
</script>`;

  const developerApiSnippet = `// Programmatic control via window.Vajra (Developer Mode)
function whenReady(cb) {
  if (window.Vajra?.isReady()) cb();
  else setTimeout(() => whenReady(cb), 100);
}

whenReady(() => {
  // Show banner when your app is ready (auto-show is disabled in Developer Mode)
  window.Vajra.showBanner();

  // React to consent changes
  window.Vajra.onConsentChange((consent) => {
    console.log('Consent updated:', consent);
  });
});

// Other available methods:
// window.Vajra.getConsent()
// window.Vajra.acceptAll()
// window.Vajra.rejectAll()
// window.Vajra.openPreferences()
// window.Vajra.hideBanner()`;

  const copyDeveloperSnippet = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard`);
  };

  const handleTestWebhook = async () => {
    const url = consentWebhookUrl.trim();
    if (!url || !url.startsWith('http')) {
      notify('Enter a valid http(s) webhook URL first');
      return;
    }

    try {
      setIsWebhookTesting(true);
      const result = await testConsentWebhook(url, orgIdParam, {
        propertyId: activeProp?.id,
        bannerId: editingBannerId ?? undefined,
      });
      if (result.success) {
        notify(`Webhook test delivered (${result.status_code}, ${result.latency_ms}ms)`);
      } else {
        notify(`Webhook test failed: ${result.message}`);
      }
    } catch (err) {
      console.error('Webhook test failed:', err);
      notify('Webhook test failed. Check the URL and try again.');
    } finally {
      setIsWebhookTesting(false);
    }
  };

  useEffect(() => {
    async function loadOrgSlug() {
      try {
        const ws = await fetchWorkspace(orgIdParam);
        if (ws.organization.slug) {
          setOrgSlug(ws.organization.slug);
        }
      } catch (err) {
        console.error('Failed to load workspace for withdrawal URL:', err);
      }
    }
    void loadOrgSlug();
  }, [orgIdParam]);

  const withdrawalUrl = orgSlug ? `${buildPublicPortalUrl(orgSlug)}?right=withdraw` : '';

  useEffect(() => {
    if (!activeProp) return;

    let isMounted = true;
    let intervalId: any = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(async () => {
        try {
          const res = await integrationsApi.getCookieScanStatus(activeProp!.id, orgIdParam);
          if (res && isMounted) {
            setScanStatus(res.status);
            if (res.status === 'completed' || res.status === 'failed') {
              clearInterval(intervalId);
              setIsScanning(false);
              const list = await integrationsApi.listTrackers(activeProp!.id, orgIdParam);
              if (isMounted) {
                setTrackersList(list || []);
              }
            }
          }
        } catch (err) {
          console.error('Error polling scan status:', err);
          clearInterval(intervalId);
          if (isMounted) {
            setIsScanning(false);
          }
        }
      }, 2000);
    };

    async function loadTrackers() {
      try {
        const list = await integrationsApi.listTrackers(activeProp!.id, orgIdParam);
        const statusRes = await integrationsApi.getCookieScanStatus(activeProp!.id, orgIdParam);
        if (isMounted) {
          setTrackersList(list || []);
          const currentStatus = statusRes?.status || null;
          setScanStatus(currentStatus);
          if (currentStatus === 'pending' || currentStatus === 'running') {
            setIsScanning(true);
            startPolling();
          }
        }
      } catch (err) {
        console.error('Failed to load trackers:', err);
      }
    }

    void loadTrackers();

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeProp]);

  const handleTriggerScan = async () => {
    if (!activeProp) return;
    try {
      setIsScanning(true);
      await integrationsApi.triggerCookieScan(activeProp.id, orgIdParam);
      setScanStatus('pending');
      pollScanStatus();
    } catch (err) {
      console.error('Failed to trigger scan:', err);
      setIsScanning(false);
    }
  };

  const pollScanStatus = () => {
    if (!activeProp) return;
    const interval = setInterval(async () => {
      try {
        const res = await integrationsApi.getCookieScanStatus(activeProp!.id, orgIdParam);
        if (res) {
          setScanStatus(res.status);
          if (res.status === 'completed' || res.status === 'failed') {
            clearInterval(interval);
            setIsScanning(false);
            const list = await integrationsApi.listTrackers(activeProp!.id, orgIdParam);
            setTrackersList(list || []);
          }
        }
      } catch (err) {
        console.error('Error polling scan status:', err);
        clearInterval(interval);
        setIsScanning(false);
      }
    }, 2000);
  };

  const getCategoryCountAndTrackers = (categoryId: string) => {
    const isScanAvailable = scanStatus === 'completed';
    
    if (!isScanAvailable) {
      const count = fallbackCounts[categoryId as keyof typeof fallbackCounts] || '0*';
      return { count, trackers: [] };
    }
    
    let matchedTrackers: any[] = [];
    if (categoryId === 'necessary') {
      matchedTrackers = trackersList.filter(t => t.active_category === 'essential');
    } else if (categoryId === 'functional') {
      matchedTrackers = trackersList.filter(t => t.active_category === 'functional');
    } else if (categoryId === 'analytics') {
      matchedTrackers = trackersList.filter(t => t.active_category === 'analytics');
    } else if (categoryId === 'advertising') {
      matchedTrackers = trackersList.filter(t => t.active_category === 'marketing' || t.active_category === 'advertising');
    } else if (categoryId === 'social') {
      matchedTrackers = trackersList.filter(t => t.active_category === 'social');
    } else {
      matchedTrackers = trackersList.filter(t => t.active_category === categoryId);
    }
    
    return {
      count: String(matchedTrackers.length),
      trackers: matchedTrackers.map(t => t.name)
    };
  };

  useEffect(() => {
    if (properties.length > 0 && selectedProperties.length === 0) {
      setSelectedProperties([properties[0]!]);
    }
  }, [properties, selectedProperties]);

  const purposeIcons: Record<string, typeof Cookie> = {
    cookie: Cookie,
    marketing: Mail,
    profiling: UserCog,
    general: Shield,
    children: Baby,
    location: MapPin,
    biometric: Fingerprint,
    health: HeartPulse,
    analytics: BarChart3,
    third_party: Share2,
    employment: Briefcase,
    custom: PenLine,
  };

  const purposes = BANNER_PURPOSE_OPTIONS.map((purpose) => ({
    ...purpose,
    icon: purposeIcons[purpose.id] ?? Shield,
  }));

  const themes = [
    { color: '#4F46E5', label: 'Blue' },
    { color: '#10B981', label: 'Green' },
    { color: '#EF4444', label: 'Red' },
    { color: '#1C1917', label: 'Dark' },
    { color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: 'Custom' },
  ];

  const languages = [
    { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'brx', name: 'Bodo', native: "बर'" },
    { code: 'doi', name: 'Dogri', native: 'डोगरी' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ks', name: 'Kashmiri', native: 'کٲशُر' },
    { code: 'kok', name: 'Konkani', native: 'कोंकणी' },
    { code: 'mai', name: 'Maithili', native: 'मैथिली' },
    { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'mni', name: 'Manipuri', native: 'মৈতৈলোন' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'ne', name: 'Nepali', native: 'नेपाली' },
    { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्' },
    { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
    { code: 'sd', name: 'Sindhi', native: 'سنڌي' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'ur', name: 'Urdu', native: 'اردو' }
  ];

  interface CategoryItem {
    id: string;
    name: string;
    required: boolean;
    trackerCount: number | string;
    defaultOn: boolean;
    description: string;
    trackers: string[];
    isSpecialCategory?: boolean;
    legalBasis?: string;
    retentionPeriod?: string;
  }

  const [categories, setCategories] = useState<CategoryItem[]>([
    {
      id: 'necessary',
      name: 'Strictly Necessary',
      required: true,
      trackerCount: 12,
      defaultOn: true,
      description: 'Required for the website to function. Cannot be disabled.',
      trackers: ['session_id', 'csrf_token', 'cart_id', 'auth_token'],
    },
    {
      id: 'functional',
      name: 'Functional',
      required: false,
      trackerCount: 24,
      defaultOn: false,
      description: 'Remember your preferences like language and region',
      trackers: ['language_pref', 'theme_pref'],
    },
    {
      id: 'analytics',
      name: 'Analytics',
      required: false,
      trackerCount: 47,
      defaultOn: false,
      description: 'Help us understand how users interact with our site',
      trackers: ['_ga Google Analytics 4', '_gid', 'mixpanel_id'],
    },
    {
      id: 'advertising',
      name: 'Advertising',
      required: false,
      trackerCount: 58,
      defaultOn: false,
      description: 'Personalize ads and measure ad performance',
      trackers: ['fbp Meta Pixel', 'gads_id', 'tiktok_pixel'],
    },
    {
      id: 'social',
      name: 'Social Media',
      required: false,
      trackerCount: 6,
      defaultOn: false,
      description: 'Enable social media features',
      trackers: ['twitter_widget', 'linkedin_insight'],
    },
  ]);

  useEffect(() => {
    if (registeredPurposes && registeredPurposes.length > 0) {
      const mapped = registeredPurposes.map(p => ({
        id: p.id,
        name: p.name,
        required: p.legal_basis === 'legitimate_use',
        trackerCount: p.data_categories?.length || 0,
        defaultOn: p.legal_basis === 'legitimate_use' ? true : false,
        description: p.description || `Data Categories: ${(p.data_categories || []).join(', ') || 'N/A'}. Retention: ${p.retention_period || 'N/A'}`,
        trackers: p.data_categories || [],
        isSpecialCategory: p.is_special_category,
        legalBasis: p.legal_basis,
        retentionPeriod: p.retention_period
      }));
      setCategories(mapped);
    }
  }, [registeredPurposes]);



  const canProceed = () => {
    if (currentStep === 1) {
      return bannerName.trim() !== '' && selectedProperties.length > 0;
    }
    if (currentStep === 6) {
      return !isCustomCssTooLong;
    }
    return true;
  };

  const handleNext = () => {
    if (canProceed() && currentStep < 6) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps([...completedSteps, currentStep]);
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePublish = () => {
    setShowPublishModal(true);
  };

  const complianceChecks = [
    { label: 'Clear language', passed: true },
    { label: 'Withdrawal as easy as grant', passed: true },
    { label: 'Multi-language not yet configured', passed: currentStep >= 5 },
    { label: 'No pre-ticked boxes', passed: true },
    { label: 'Granular per-purpose toggles', passed: true },
  ];

  const complianceScore = complianceChecks.filter((c) => c.passed).length * 20;

  return (
    <>
      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        {/* Modal Container */}
        <div
          className="w-full max-w-6xl max-h-[720px] rounded-3xl overflow-hidden flex flex-col bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-8 py-6 flex items-center justify-between border-b border-[var(--border-default)]"
          >
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]" >
              Create Consent Banner
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-[var(--surface-raised)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-secondary)]"  strokeWidth={1.5} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Steps */}
            <div className="w-60 p-6" style={{ backgroundColor: 'var(--surface-raised)' }}>
              <div className="space-y-2">
                {steps.map((step) => {
                  const isCompleted = completedSteps.includes(step.number);
                  const isCurrent = currentStep === step.number;
                  const isLocked = step.number > currentStep && !isCompleted;

                  return (
                    <button
                      key={step.number}
                      disabled={isLocked}
                      onClick={() => {
                        if (!isLocked) {
                          setCurrentStep(step.number);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                        isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                      style={{
                        backgroundColor: isCurrent ? 'var(--brand-primary)' : isCompleted ? 'var(--status-success-bg)' : 'transparent',
                        color: isCurrent ? 'white' : isCompleted ? 'var(--status-success)' : 'var(--text-secondary)',
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: isCurrent
                            ? 'rgba(255, 255, 255, 0.2)'
                            : isCompleted
                            ? 'var(--status-success)'
                            : 'rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        {isCompleted ? (
                          <Check className="w-4 h-4" style={{ color: 'white' }} strokeWidth={2} />
                        ) : isLocked ? (
                          <Lock className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <step.icon className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </div>
                      <span className="flex-1 text-left">{step.label}</span>
                      </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
              {/* Step 1: Basic Information */}
              {currentStep === 1 && (
                <div className="p-8 space-y-6">
                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Banner Name <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      <input
                        type="text"
                        value={bannerName}
                        onChange={(e) => setBannerName(e.target.value)}
                        placeholder="e.g., Acme Retail Main Banner"
                        className="w-full px-4 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                      />
                      <p className="text-xs mt-2 text-[var(--text-tertiary)]" >
                        Internal name only — not shown to users
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Helps your team identify which banner to update later"
                        rows={4}
                        className="w-full px-4 py-2 rounded-lg border text-sm resize-none text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                      />
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Where will this banner appear? <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      {isPropertiesLoading ? (
                        <div className="text-sm text-[var(--text-secondary)] animate-pulse">
                          Loading listed properties...
                        </div>
                      ) : properties.length === 0 ? (
                        <div className="text-sm text-[var(--status-danger)]">
                          No integration properties configured. Please add a website domain first in the Technical Integration tab.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {properties.map((prop) => (
                            <button
                              key={prop}
                              onClick={() => {
                                if (selectedProperties.includes(prop)) {
                                  setSelectedProperties(selectedProperties.filter((p) => p !== prop));
                                } else {
                                  setSelectedProperties([...selectedProperties, prop]);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                              style={{
                                backgroundColor: selectedProperties.includes(prop) ? 'var(--brand-primary)' : 'var(--surface-raised)',
                                color: selectedProperties.includes(prop) ? 'white' : 'var(--text-secondary)',
                              }}
                            >
                              {prop}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isBankingOrg && Object.keys(bankingPresets).length > 0 && (
                      <div className="pt-4 border-t border-[var(--border-default)]">
                        <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                          Fino banking channel
                        </label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {Object.entries(bankingPresets).map(([key, preset]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => applyBankingPreset(key)}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                              style={{
                                backgroundColor:
                                  bankingChannel === key ? 'var(--brand-primary)' : 'var(--surface-raised)',
                                color: bankingChannel === key ? 'white' : 'var(--text-secondary)',
                              }}
                            >
                              {String(preset.journey_label || key)}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Maps this banner to a banking journey for CMP config theming. Click a channel to apply suggested CTA labels.
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Linked DPDPA Consent Notice
                      </label>
                      <select
                        value={consentNoticeId}
                        onChange={(e) => setConsentNoticeId(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                      >
                        <option value="">-- Select a published DPDPA Notice (Optional) --</option>
                        {registeredNotices.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.display_name || n.internal_name} (v{n.version_label || '1.0'})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs mt-2 text-[var(--text-tertiary)]" >
                        Associates this banner with an official pre-consent disclosure for legal evidence tracking under DPDPA Section 6.
                      </p>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                     <label className="block text-sm font-medium mb-4 text-[var(--text-primary)]">
                       Banner Purpose <span className="text-[var(--status-danger)]">*</span>
                       <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                         (for internal reference only — not shown to end users)
                       </span>
                       <span className="ml-2 text-xs font-normal text-[var(--brand-primary)]">
                         Select one or more
                       </span>
                     </label>
                    <div className="grid grid-cols-2 gap-4">
                      {purposes.map((purpose) => {
                        const isSelected = bannerPurpose.includes(purpose.id);
                        return (
                          <button
                            key={purpose.id}
                            type="button"
                            onClick={() => {
                              setBannerPurpose((prev) => {
                                const alreadySelected = prev.includes(purpose.id);
                                if (alreadySelected) {
                                  if (prev.length <= 1) return prev; // keep at least one
                                  const next = prev.filter((id) => id !== purpose.id);
                                  if (!next.includes('custom')) setCustomPurposeText('');
                                  return next;
                                } else {
                                  return [...prev, purpose.id];
                                }
                              });
                            }}
                            className="p-4 rounded-xl text-left transition-all cursor-pointer relative"
                            style={{
                              border: `2px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                              backgroundColor: isSelected ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--surface-card)'
                            }}
                          >
                            {isSelected && (
                              <span
                                className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: 'var(--brand-primary)' }}
                              >
                                ✓
                              </span>
                            )}
                            <div className="flex items-start gap-3">
                              <purpose.icon className="w-5 h-5 mt-0.5" style={{ color: 'var(--brand-primary)' }} strokeWidth={1.5} />
                              <div className="flex-1">
                                <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]" >
                                  {purpose.label}
                                </div>
                                <div className="text-xs text-[var(--text-secondary)]" >
                                  {purpose.description}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {bannerPurpose.includes('custom') && (
                      <div className="mt-4">
                        <label className="block text-xs font-semibold mb-2 text-[var(--text-secondary)]">
                          Custom purpose description <span className="text-[var(--status-danger)]">*</span>
                        </label>
                        <input
                          type="text"
                          value={customPurposeText}
                          onChange={(e) => setCustomPurposeText(e.target.value)}
                          maxLength={500}
                          placeholder="e.g. Partner onboarding consent for B2B portal"
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)] outline-none focus:border-[var(--brand-primary)]"
                        />
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                          Stored for your team&apos;s reference only.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Display Settings */}
              {currentStep === 2 && (
                <div className="p-8 flex gap-8">
                  {/* Left: Form (55%) */}
                  <div className="flex-1 space-y-6">
                    <div
                      className="p-6 rounded-xl space-y-4"
                      style={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <label className="block text-sm font-medium mb-4 text-[var(--text-primary)]" >
                        Display Style <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => { setDisplayStyle('banner'); setPosition('bottom'); }}
                          className="p-6 rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer"
                          style={{
                            border: `2px solid ${displayStyle === 'banner' ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            backgroundColor: displayStyle === 'banner' ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--surface-card)'
                          }}
                        >
                          <div
                            className="w-full h-16 rounded-lg flex items-end p-2"
                            style={{ backgroundColor: 'var(--surface-raised)' }}
                          >
                            <div className="w-full h-6 rounded" style={{ backgroundColor: 'var(--brand-primary)' }} />
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]" >
                            Banner
                          </div>
                        </button>
                        <button
                          onClick={() => { setDisplayStyle('modal'); setPosition('center'); }}
                          className="p-6 rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer"
                          style={{
                            border: `2px solid ${displayStyle === 'modal' ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            backgroundColor: displayStyle === 'modal' ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--surface-card)'
                          }}
                        >
                          <div
                            className="w-full h-16 rounded-lg flex items-center justify-center p-2"
                            style={{ backgroundColor: 'var(--surface-raised)' }}
                          >
                            <div className="w-12 h-12 rounded" style={{ backgroundColor: 'var(--brand-primary)' }} />
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]" >
                            Modal
                          </div>
                        </button>
                      </div>
                    </div>

                    <div
                      className="p-6 rounded-xl space-y-4"
                      style={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <label className="block text-sm font-medium mb-3 text-[var(--text-primary)]" >
                        Position <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      {displayStyle === 'modal' ? (
                        <div className="flex gap-4">
                          <button
                            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium cursor-default"
                            style={{
                              backgroundColor: 'var(--brand-primary)',
                              color: 'white',
                            }}
                          >
                            Center
                          </button>
                          <div className="flex-1 text-xs flex items-center text-[var(--text-tertiary)]">
                            Modal banners are always centered on screen
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-4">
                          <button
                            onClick={() => setPosition('top')}
                            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                            style={{
                              backgroundColor: position === 'top' ? 'var(--brand-primary)' : 'var(--surface-raised)',
                              color: position === 'top' ? 'white' : 'var(--text-secondary)',
                            }}
                          >
                            Top
                          </button>
                          <button
                            onClick={() => setPosition('bottom')}
                            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                            style={{
                              backgroundColor: position === 'bottom' ? 'var(--brand-primary)' : 'var(--surface-raised)',
                              color: position === 'bottom' ? 'white' : 'var(--text-secondary)',
                            }}
                          >
                            Bottom
                        </button>
                      </div>
                      )}
                    </div>

                    <div
                      className="p-6 rounded-xl space-y-4"
                      style={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <label className="block text-sm font-medium mb-3 text-[var(--text-primary)]" >
                        Theme <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        {themes.map((t, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setTheme(t.color)}
                            className="w-16 h-16 rounded-xl flex items-center justify-center transition-all hover:scale-105 cursor-pointer relative overflow-hidden"
                            style={{
                              background: t.color,
                              border: `3px solid ${theme === t.color ? 'var(--brand-deep)' : 'transparent'}`
                            }}
                          >
                            {theme === t.color && <Check className="w-5 h-5" style={{ color: 'white' }} strokeWidth={2} />}
                          </button>
                        ))}
                        
                        {/* Custom Color Picker */}
                        <div className="flex flex-col items-center gap-1">
                          <label className="text-[10px] text-[var(--text-secondary)] font-medium">Custom Picker</label>
                          <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center transition-all hover:scale-105 cursor-pointer relative border border-[var(--border-default)] overflow-hidden"
                            style={{
                              backgroundColor: theme.startsWith('#') && !['#4F46E5', '#10B981', '#EF4444', '#1C1917'].includes(theme) ? theme : '#ffffff'
                            }}
                          >
                            <input
                              type="color"
                              value={theme.startsWith('#') ? theme : '#4F46E5'}
                              onChange={(e) => setTheme(e.target.value)}
                              className="absolute inset-0 w-full h-full p-0 m-0 border-0 cursor-pointer opacity-0"
                            />
                            {theme.startsWith('#') && !['#4F46E5', '#10B981', '#EF4444', '#1C1917'].includes(theme) ? (
                              <Check className="w-5 h-5 text-white mix-blend-difference" strokeWidth={2} />
                            ) : (
                              <Plus className="w-5 h-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Template Selector Section */}
                    <div
                      className="p-6 rounded-xl space-y-4"
                      style={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <label className="block text-sm font-medium mb-3 text-[var(--text-primary)]" >
                        Template Design <span className="text-[var(--status-danger)]">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                        {[
                          { id: 'classic', name: 'Classic', desc: 'Standard solid card layout' },
                          { id: 'liquid-glass', name: 'Liquid Glass', desc: 'Glassmorphism with backdrop blur' },
                          { id: 'neon-cyber', name: 'Neon Cyber', desc: 'Dark theme with glowing neon outline' },
                          { id: 'minimalist-light', name: 'Minimalist Light', desc: 'Clean, thin borders and spacing' },
                          { id: 'minimalist-dark', name: 'Minimalist Dark', desc: 'Sleek dark design with spacing' },
                          { id: 'modern-warm', name: 'Modern Warm', desc: 'Serif headings, warm cream background' },
                          { id: 'ocean-breeze', name: 'Ocean Breeze', desc: 'Flowing blue-green gradient background' },
                          { id: 'retro-amber', name: 'Retro Amber', desc: 'Vintage amber terminal style' },
                          { id: 'corporate', name: 'Corporate', desc: 'High contrast, sharp corners, bold look' },
                          { id: 'aurora', name: 'Aurora Glow', desc: 'Fluid subtle dynamic gradient background' }
                        ].map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setTemplate(tpl.id)}
                            className="p-3 rounded-lg text-left transition-all border cursor-pointer hover:border-[var(--brand-primary)]"
                            style={{
                              borderColor: template === tpl.id ? 'var(--brand-primary)' : 'var(--border-default)',
                              backgroundColor: template === tpl.id ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--surface-card)'
                            }}
                          >
                            <div className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">{tpl.name}</div>
                            <div className="text-[10px] text-[var(--text-secondary)] leading-tight">{tpl.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="p-6 rounded-xl space-y-4"
                      style={{
                        backgroundColor: 'var(--surface-primary)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <label className="block text-sm font-semibold mb-2 text-[var(--text-primary)]" >
                        Custom CSS
                      </label>
                      <textarea
                        value={customCss}
                        onChange={(e) => setCustomCss(e.target.value)}
                        placeholder="/* Override styles without modifying Vajra core. Use sparingly. */"
                        rows={6}
                        className="w-full px-4 py-3 rounded-lg border text-sm font-mono resize-none"
                        style={{
                          borderColor: isCustomCssTooLong ? 'var(--status-danger)' : 'var(--border-default)',
                          backgroundColor: '#1E1B4B',
                          color: '#E5E7EB',
                        }}
                      />
                      <div className="flex items-start justify-between gap-4 text-xs">
                        <p style={{ color: isCustomCssTooLong ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>
                          {isCustomCssTooLong
                            ? `Custom CSS must be 2500 characters or fewer. Remove ${customCssLength - MAX_CUSTOM_CSS_LENGTH} characters to continue.`
                            : 'Override styles without modifying Vajra core. Use sparingly. Max 2500 characters.'}
                        </p>
                        <span style={{ color: isCustomCssTooLong ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>
                          {customCssLength}/{MAX_CUSTOM_CSS_LENGTH}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Preview (45%) */}
                  <div className="w-2/5 space-y-4">
                    <div className="sticky top-0">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        {abTestEnabled && (
                          <div className="flex bg-[var(--surface-raised)] p-1 rounded-lg mr-4">
                            <button
                              onClick={() => setPreviewVariant('A')}
                              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${previewVariant === 'A' ? 'bg-white shadow-sm text-[var(--brand-primary)]' : 'text-[var(--text-secondary)]'}`}
                            >
                              Variant A
                            </button>
                            <button
                              onClick={() => setPreviewVariant('B')}
                              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${previewVariant === 'B' ? 'bg-white shadow-sm text-[var(--brand-primary)]' : 'text-[var(--text-secondary)]'}`}
                            >
                              Variant B
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => setPreviewDevice('desktop')}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                          style={{
                            backgroundColor: previewDevice === 'desktop' ? 'var(--brand-primary)' : 'var(--surface-raised)',
                            color: previewDevice === 'desktop' ? 'white' : 'var(--text-secondary)',
                          }}
                        >
                          <Monitor className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => setPreviewDevice('tablet')}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                          style={{
                            backgroundColor: previewDevice === 'tablet' ? 'var(--brand-primary)' : 'var(--surface-raised)',
                            color: previewDevice === 'tablet' ? 'white' : 'var(--text-secondary)',
                          }}
                        >
                          <Tablet className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => setPreviewDevice('mobile')}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                          style={{
                            backgroundColor: previewDevice === 'mobile' ? 'var(--brand-primary)' : 'var(--surface-raised)',
                            color: previewDevice === 'mobile' ? 'white' : 'var(--text-secondary)',
                          }}
                        >
                          <Smartphone className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div
                        className="rounded-xl overflow-hidden transition-all duration-300"
                        style={{
                          border: '1px solid var(--border-default)',
                          backgroundColor: 'var(--surface-raised)',
                          width: previewDevice === 'desktop' ? '100%' : previewDevice === 'tablet' ? '340px' : '230px',
                          margin: '0 auto',
                        }}
                      >
                        {/* Mock Browser Frame */}
                        <div className="bg-[var(--surface-card)] px-3 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border-default)' }}>
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <div className="w-2 h-2 rounded-full bg-yellow-400" />
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                          </div>
                          <div className="flex-1 px-3 py-1 rounded text-xs" style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-tertiary)' }}>
                            {selectedProperties[0] || 'yourwebsite.com'}
                          </div>
                        </div>

                        {/* Preview Content */}
                        <div
                          className="relative w-full bg-white text-gray-800 p-4 flex flex-col justify-between overflow-hidden transition-all duration-300"
                          style={{
                            height: previewDevice === 'desktop' ? '240px' : previewDevice === 'tablet' ? '320px' : '360px',
                          }}
                        >
                          {currentCustomCss && <style dangerouslySetInnerHTML={{ __html: currentCustomCss }} />}
                          <style dangerouslySetInnerHTML={{ __html: getTemplateCSS(currentTemplate, currentTheme) }} />

                          <div className="text-[10px] text-gray-400">Website Content Mock...</div>

                          {currentDisplayStyle === 'banner' && (
                            <div
                              id="zs-banner-preview"
                              className={cn(
                                'absolute left-0 right-0 p-3 flex flex-col gap-1.5 shadow-lg transition-all border-t border-b',
                                currentPosition === 'top' ? 'top-0 border-b-gray-200' : 'bottom-0 border-t-gray-200',
                                `zs-tpl-${currentTemplate}`
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="zs-heading text-[10px] font-semibold mb-0.5">
                                    {heading || 'We value your privacy'}
                                  </div>
                                  <div className="zs-body-text text-[8px] opacity-95 line-clamp-2 leading-relaxed">
                                    {bodyText || 'We use cookies and similar technologies to provide, protect, and improve our services.'}
                                  </div>
                                  {(privacyPolicyUrl || cookiePolicyUrl) && (
                                    <div className="flex gap-1.5 mt-0.5 opacity-80">
                                      {privacyPolicyUrl && <span className="underline text-[7px]">Privacy Policy</span>}
                                      {privacyPolicyUrl && cookiePolicyUrl && <span className="text-[7px]">·</span>}
                                      {cookiePolicyUrl && <span className="underline text-[7px]">Cookie Policy</span>}
                                    </div>
                                  )}
                                </div>
                                {showLanguageSwitcher && (
                                  <select className="text-[7px] bg-white/20 text-white rounded px-1 py-0.5 border-none outline-none cursor-pointer" defaultValue="en">
                                    <option value="en">EN</option>
                                    <option value="hi">हिन्दी</option>
                                    <option value="ta">தமிழ்</option>
                                  </select>
                                )}
                              </div>
                              <div className="flex justify-end gap-1 mt-0.5">
                                <button type="button" className="zs-cta-btn zs-cta-reject px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[80px]">
                                  {secondaryCta || 'Reject All'}
                                </button>
                                <button type="button" className="zs-cta-btn zs-cta-customize px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[80px]">
                                  {tertiaryCta || 'Customize'}
                                </button>
                                <button type="button" className="zs-cta-btn zs-cta-accept px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[80px]">
                                  {primaryCta || 'Accept'}
                                </button>
                              </div>
                            </div>
                          )}

                          {currentDisplayStyle === 'modal' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4">
                              <div
                                id="zs-modal-preview"
                                className={cn(
                                  'w-11/12 max-w-[200px] p-3 rounded-lg shadow-xl flex flex-col gap-1.5',
                                  `zs-tpl-${currentTemplate}`
                                )}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex-1">
                                    <div className="zs-heading text-[10px] font-semibold mb-0.5">
                                      {heading || 'We value your privacy'}
                                    </div>
                                    <div className="zs-body-text text-[8px] opacity-95 line-clamp-3 leading-relaxed">
                                      {bodyText || 'We use cookies and similar technologies to provide, protect, and improve our services.'}
                                    </div>
                                    {(privacyPolicyUrl || cookiePolicyUrl) && (
                                      <div className="flex gap-1 mt-0.5 opacity-80">
                                        {privacyPolicyUrl && <span className="underline text-[6px]">Privacy Policy</span>}
                                        {privacyPolicyUrl && cookiePolicyUrl && <span className="text-[6px]">·</span>}
                                        {cookiePolicyUrl && <span className="underline text-[6px]">Cookie Policy</span>}
                                      </div>
                                    )}
                                  </div>
                                  {showLanguageSwitcher && (
                                    <select className="text-[6px] bg-white/20 text-white rounded px-0.5 py-0.5 border-none outline-none cursor-pointer" defaultValue="en">
                                      <option value="en">EN</option>
                                      <option value="hi">हिन्दी</option>
                                      <option value="ta">தமிழ்</option>
                                    </select>
                                  )}
                                </div>
                                <div className="flex justify-end gap-1.5 mt-0.5">
                                  <button type="button" className="zs-cta-btn zs-cta-reject px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[65px]">
                                    {secondaryCta || 'Reject All'}
                                  </button>
                                  <button type="button" className="zs-cta-btn zs-cta-customize px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[65px]">
                                    {tertiaryCta || 'Customize'}
                                  </button>
                                  <button type="button" className="zs-cta-btn zs-cta-accept px-1.5 py-0.5 rounded text-[7px] font-medium truncate max-w-[65px]">
                                    {primaryCta || 'Accept'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Compliance Check */}
                      <div
                        className="mt-4 p-4 rounded-xl"
                        style={{
                          backgroundColor: 'var(--surface-primary)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        <div className="text-sm font-semibold mb-3 text-[var(--text-primary)]" >
                          DPDPA Compliance Check
                        </div>
                        <div className="space-y-2 mb-3">
                          {complianceChecks.map((check, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: check.passed ? 'var(--status-success)' : 'var(--status-warning)',
                                }}
                              >
                                {check.passed ? (
                                  <Check className="w-3 h-3" style={{ color: 'white' }} strokeWidth={2} />
                                ) : (
                                  <AlertTriangle className="w-3 h-3" style={{ color: 'white' }} strokeWidth={2} />
                                )}
                              </div>
                              <span className="text-[var(--text-secondary)]">{check.label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-semibold text-[var(--text-primary)]" >
                            {complianceScore}/100
                          </div>
                          <div className="text-xs text-[var(--text-tertiary)]" >
                            Will improve as you complete remaining steps
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Content */}
              {currentStep === 3 && (
                <div className="p-8 space-y-6">
                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Heading
                      </label>
                      <input
                        type="text"
                        value={heading}
                        onChange={(e) => setHeading(e.target.value)}
                        placeholder="We value your privacy"
                        maxLength={60}
                        className="w-full px-4 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                      />
                      <div className="text-xs mt-1 text-right text-[var(--text-tertiary)]" >
                        {heading.length}/60 characters
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]" >
                        Body Text
                      </label>
                      <textarea
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        placeholder="We use cookies and similar technologies to enhance your experience, analyze traffic, and personalize content. Under India's DPDPA 2023, you can manage your preferences anytime..."
                        maxLength={500}
                        rows={6}
                        className="w-full px-4 py-2 rounded-lg border text-sm resize-none text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                      />
                      <div className="text-xs mt-2 text-right text-[var(--text-tertiary)]" >
                        {bodyText.length}/500
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Action Buttons
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Primary CTA
                        </label>
                        <input
                          type="text"
                          value={primaryCta}
                          onChange={(e) => setPrimaryCta(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Secondary CTA
                        </label>
                        <input
                          type="text"
                          value={secondaryCta}
                          onChange={(e) => setSecondaryCta(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Tertiary CTA
                        </label>
                        <input
                          type="text"
                          value={tertiaryCta}
                          onChange={(e) => setTertiaryCta(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]">
                          Withdraw CTA label
                        </label>
                        <input
                          type="text"
                          value={ctaWithdraw}
                          onChange={(e) => setCtaWithdraw(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                      <label className="flex items-center gap-2 pt-6 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showWithdrawAction}
                          onChange={(e) => setShowWithdrawAction(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-[var(--text-secondary)]">Show withdraw action on banner</span>
                      </label>
                    </div>
                    <div
                      className="p-3 rounded-lg flex gap-3"
                      style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
                    >
                      <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-warning)' }} strokeWidth={1.5} />
                      <p className="text-xs text-[var(--status-warning)]">
                        DPDPA Section 6(3) requires Reject and Accept to have equal visual prominence. Vajra enforces button parity automatically.
                      </p>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Links
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Privacy Policy URL
                        </label>
                        <input
                          type="url"
                          value={privacyPolicyUrl}
                          onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                          placeholder={`https://${selectedProperties[0] || 'yourwebsite.com'}/privacy`}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Cookie Policy URL
                        </label>
                        <input
                          type="url"
                          value={cookiePolicyUrl}
                          onChange={(e) => setCookiePolicyUrl(e.target.value)}
                          placeholder={`https://${selectedProperties[0] || 'yourwebsite.com'}/cookies`}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Withdrawal URL
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={withdrawalUrl || `https://${selectedProperties[0] || 'yourwebsite.com'}/withdraw-consent`}
                            className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono"
                            style={{
                              borderColor: 'var(--border-default)',
                              color: 'var(--text-tertiary)',
                              backgroundColor: 'var(--surface-raised)',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (withdrawalUrl) {
                                void navigator.clipboard.writeText(withdrawalUrl);
                                notify('Withdrawal URL copied to clipboard');
                              }
                            }}
                            className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                            style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs mt-1 text-[var(--text-tertiary)]" >
                          Auto-generated, links to Rights Portal
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          DPO Contact Email
                        </label>
                        <input
                          type="email"
                          value={dpoEmail}
                          onChange={(e) => setDpoEmail(e.target.value)}
                          placeholder={`dpo@${selectedProperties[0] || 'yourwebsite.com'}`}
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Privacy Categories */}
              {currentStep === 4 && (
                <div className="p-8 space-y-6">
                  {(() => {
                    const domain = selectedProperties[0] || 'yourwebsite.com';
                    if (isScanning || scanStatus === 'pending' || scanStatus === 'running') {
                      return (
                        <div
                          className="p-4 rounded-lg flex items-start gap-3"
                          style={{ backgroundColor: 'var(--status-info-bg)', border: '1px solid var(--status-info)' }}
                        >
                          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse" style={{ color: 'var(--status-info)' }} strokeWidth={1.5} />
                          <div className="flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              <strong>Scanning in progress...</strong> Vajra is detecting cookies and trackers on {domain}.
                            </p>
                            <button
                              type="button"
                              disabled={true}
                              className="text-sm font-medium mt-1 cursor-not-allowed opacity-50 flex items-center gap-1"
                              style={{ color: 'var(--status-info)' }}
                            >
                              Scanning...
                            </button>
                          </div>
                        </div>
                      );
                    } else if (scanStatus === 'completed') {
                      return (
                        <div
                          className="p-4 rounded-lg flex items-start gap-3"
                          style={{ backgroundColor: 'var(--status-info-bg)', border: '1px solid var(--status-info)' }}
                        >
                          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-info)' }} strokeWidth={1.5} />
                          <div className="flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              <strong>{trackersList.length} trackers detected</strong> on {domain}. Vajra has auto-grouped them into categories. Edit below or accept defaults.
                            </p>
                            <button
                              type="button"
                              onClick={handleTriggerScan}
                              className="text-sm font-medium mt-1 cursor-pointer hover:underline flex items-center gap-1"
                              style={{ color: 'var(--status-info)' }}
                            >
                              Re-scan →
                            </button>
                          </div>
                        </div>
                      );
                    } else if (scanStatus === 'failed') {
                      return (
                        <div
                          className="p-4 rounded-lg flex items-start gap-3"
                          style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
                        >
                          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} strokeWidth={1.5} />
                          <div className="flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              <strong>Scan failed</strong> on {domain}. Run scan to try again.
                            </p>
                            <button
                              type="button"
                              onClick={handleTriggerScan}
                              className="text-sm font-medium mt-1 cursor-pointer hover:underline flex items-center gap-1"
                              style={{ color: 'var(--status-warning)' }}
                            >
                              Run scan →
                            </button>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div
                          className="p-4 rounded-lg flex items-start gap-3"
                          style={{ backgroundColor: 'var(--status-info-bg)', border: '1px solid var(--status-info)' }}
                        >
                          <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-info)' }} strokeWidth={1.5} />
                          <div className="flex-1">
                            <p className="text-sm text-[var(--text-primary)]">
                              Run scan to detect trackers on {domain}. Vajra will automatically group them into categories.
                            </p>
                            <button
                              type="button"
                              onClick={handleTriggerScan}
                              className="text-sm font-medium mt-1 cursor-pointer hover:underline flex items-center gap-1"
                              style={{ color: 'var(--status-info)' }}
                            >
                              Run scan →
                            </button>
                          </div>
                        </div>
                      );
                    }
                  })()}

                  <div className="space-y-4">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="p-6 rounded-xl"
                        style={{
                          backgroundColor: 'var(--surface-primary)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start gap-3 flex-1">
                            <input
                              type="checkbox"
                              checked={category.defaultOn}
                              disabled={category.required}
                              onChange={(e) => {
                                setCategories(categories.map(c => 
                                  c.id === category.id ? { ...c, defaultOn: e.target.checked } : c
                                ));
                              }}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-[var(--text-primary)]" >
                                  {category.name}
                                </h4>
                                {category.legalBasis && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{
                                      backgroundColor: category.legalBasis === 'consent' ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface-raised)',
                                      color: category.legalBasis === 'consent' ? 'var(--status-success)' : 'var(--text-secondary)'
                                    }}
                                  >
                                    {category.legalBasis === 'consent' ? 'Consent' : 'Legitimate Use'}
                                  </span>
                                )}
                                {category.isSpecialCategory && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)' }}
                                  >
                                    Special Category
                                  </span>
                                )}
                                {category.retentionPeriod && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-tertiary)' }}
                                  >
                                    Retention: {category.retentionPeriod}
                                  </span>
                                )}
                                <span
                                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-secondary)' }}
                                >
                                  {getCategoryCountAndTrackers(category.id).count} trackers
                                </span>
                                {category.required && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{ backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)' }}
                                  >
                                    Required
                                  </span>
                                )}
                              </div>
                              <p className="text-sm mb-3 text-[var(--text-secondary)]" >
                                {category.description}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {getCategoryCountAndTrackers(category.id).trackers.slice(0, 4).map((tracker, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 rounded text-xs font-mono"
                                    style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-tertiary)' }}
                                  >
                                    {tracker}
                                  </span>
                                ))}
                                {getCategoryCountAndTrackers(category.id).trackers.length > 4 && (
                                  <button className="text-xs font-medium cursor-pointer" style={{ color: 'var(--brand-primary)' }}>
                                    +{getCategoryCountAndTrackers(category.id).trackers.length - 4} more
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {category.required && <Lock className="w-4 h-4 text-[var(--text-tertiary)]"  strokeWidth={1.5} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Languages */}
              {currentStep === 5 && (
                <div className="p-8 space-y-6">
                  <div
                    className="p-6 rounded-xl"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-sm font-semibold text-[var(--text-primary)]" >
                        Source language:
                      </span>
                      <span
                        className="px-3 py-1 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}
                      >
                        English
                      </span>
                      <Lock className="w-4 h-4 ml-1 text-[var(--text-tertiary)]"  strokeWidth={1.5} />
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Supported Eighth Schedule Languages (All Active)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                      {languages.map((lang) => (
                        <div
                          key={lang.code}
                          className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
                          style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.05)',
                            color: 'var(--status-success)',
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                          }}
                        >
                          <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate text-[10px] text-[var(--text-secondary)] font-normal">{lang.name}</span>
                            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{lang.native}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl"
                    style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <Sparkles className="w-6 h-6 flex-shrink-0 text-[var(--brand-primary)]" strokeWidth={1.5} />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold mb-1 text-[var(--text-primary)]" >
                          Vajra AI Language Engine Active
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          All 22 constitutional languages are automatically active and pre-translated on our servers. When you save or update the banner text, Vajra AI generates high-fidelity compliance-reviewed translations.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Auto-detect Settings
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={detectBrowserLocale}
                          onChange={(e) => setDetectBrowserLocale(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                        <div>
                          <div className="text-sm font-semibold mb-0.5 text-[var(--text-primary)]" >
                            Auto-detect from Browser Locale
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]" >
                            Automatically serve translation matching the visitor's browser language configuration (navigator.language).
                          </div>
                        </div>
                      </label>
                      
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={detectGeoIP}
                          onChange={(e) => setDetectGeoIP(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                        <div>
                          <div className="text-sm font-semibold mb-0.5 text-[var(--text-primary)]" >
                            Visitor Geo-IP State Lookup
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]" >
                            Detect the visitor's geographic location/state using their IP address and fallback to the state's primary language.
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={persistUserChoice}
                          onChange={(e) => setPersistUserChoice(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                        <div>
                          <div className="text-sm font-semibold mb-0.5 text-[var(--text-primary)]" >
                            Remember Language Choice
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]" >
                            Persist any manually chosen languages in local cookies so visitors don't have to choose it again.
                          </div>
                        </div>
                      </label>
                    </div>
                    
                    <label className="flex items-center gap-2 pt-4 border-t cursor-pointer" style={{ borderColor: 'var(--border-default)' }}>
                      <input
                        type="checkbox"
                        checked={showLanguageSwitcher}
                        onChange={(e) => setShowLanguageSwitcher(e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                      />
                      <span className="text-sm text-[var(--text-secondary)]" >
                        Show language switcher inside banner
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 6: Advanced */}
              {currentStep === 6 && (
                <div className="p-8 space-y-6">
                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <label className="block text-sm font-semibold mb-2 text-[var(--text-primary)]" >
                      Geo-targeting
                    </label>
                    <select
                      className="w-full px-4 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                    >
                      <option>All countries</option>
                      <option>India only</option>
                      <option>EU only</option>
                      <option>Custom...</option>
                    </select>
                    <p className="text-xs text-[var(--text-tertiary)]" >
                      Different banners can apply per region. Useful for GDPR (EU) vs DPDPA (India)
                    </p>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Consent Persistence
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Storage method
                        </label>
                        <select
                          disabled
                          className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)] opacity-60 cursor-not-allowed"
                        >
                          <option>LocalStorage (default)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                          Valid for
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={consentValidDays}
                            onChange={(e) => setConsentValidDays(Number(e.target.value))}
                            className="flex-1 px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                          />
                          <span className="px-3 py-2 text-sm text-[var(--text-secondary)]" >
                            days
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <h3 className="text-sm font-semibold mb-4 text-[var(--text-primary)]" >
                      Webhook Integration
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Vajra POSTs a JSON consent event to your endpoint whenever a user accepts,
                      rejects, or updates preferences. Use the Test button to send a sample payload.
                    </p>
                    <div>
                      <label className="block text-xs font-medium mb-2 text-[var(--text-secondary)]" >
                        Consent event webhook URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={consentWebhookUrl}
                          onChange={(e) => setConsentWebhookUrl(e.target.value)}
                          placeholder="https://api.acmeretail.in/webhooks/consent"
                          className="flex-1 px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleTestWebhook()}
                          disabled={isWebhookTesting || !consentWebhookUrl.trim()}
                          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                        >
                          {isWebhookTesting ? 'Testing…' : 'Test'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <label className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]" >
                          A/B Testing
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]" >
                          Test different banner variations to optimize consent rate
                        </div>
                      </div>
                      <input type="checkbox" className="w-5 h-5" checked={abTestEnabled} onChange={(e) => setAbTestEnabled(e.target.checked)} />
                    </label>
                    {abTestEnabled && abTestStartedAt && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Test started: {new Date(abTestStartedAt).toLocaleString('en-IN')}
                        {editingBannerId ? (
                          <>
                            {' · '}
                            <a
                              href={`/consent/banner?ab=${editingBannerId}`}
                              className="text-[var(--brand-primary)] underline"
                            >
                              View A/B summary on dashboard
                            </a>
                          </>
                        ) : null}
                      </p>
                    )}
                    {abTestEnabled && (
                      <div className="mt-4 pt-4 border-t border-[var(--border-default)] space-y-6">
                        <div className="bg-[var(--surface-raised)] p-4 rounded-lg flex gap-4 mb-4">
                          <div className="flex-1 text-center">
                            <div className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Variant A (Control)</div>
                            <div className="h-12 rounded bg-white shadow-sm flex flex-col items-center justify-center text-[10px] gap-0.5" style={{ borderLeft: `4px solid ${theme}` }}>
                              <span className="font-medium">Theme: {theme}</span>
                              <span className="opacity-70 capitalize">{template} • {displayStyle}</span>
                            </div>
                          </div>
                          <div className="flex-1 text-center">
                            <div className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Variant B (Test)</div>
                            <div className="h-12 rounded bg-white shadow-sm flex flex-col items-center justify-center text-[10px] gap-0.5" style={{ borderLeft: `4px solid ${abVariantTheme}` }}>
                              <span className="font-medium">Theme: {abVariantTheme}</span>
                              <span className="opacity-70 capitalize">{abVariantTemplate} • {abVariantDisplayStyle}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Variant B Display Style
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setAbVariantDisplayStyle('banner'); setAbVariantPosition('bottom'); }}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${abVariantDisplayStyle === 'banner' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'border-[var(--border-default)] hover:border-[var(--text-tertiary)]'}`}
                              >
                                Banner
                              </button>
                              <button
                                onClick={() => { setAbVariantDisplayStyle('modal'); setAbVariantPosition('center'); }}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${abVariantDisplayStyle === 'modal' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'border-[var(--border-default)] hover:border-[var(--text-tertiary)]'}`}
                              >
                                Modal
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Variant B Position
                            </label>
                            {abVariantDisplayStyle === 'modal' ? (
                              <div className="py-2 px-3 rounded-lg bg-[var(--surface-raised)] text-xs text-[var(--text-tertiary)] text-center">
                                Modal is always centered
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setAbVariantPosition('top')}
                                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${abVariantPosition === 'top' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'border-[var(--border-default)] hover:border-[var(--text-tertiary)]'}`}
                                >
                                  Top
                                </button>
                                <button
                                  onClick={() => setAbVariantPosition('bottom')}
                                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${abVariantPosition === 'bottom' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'border-[var(--border-default)] hover:border-[var(--text-tertiary)]'}`}
                                >
                                  Bottom
                                </button>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Variant B Theme Color
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                              {themes.map((t, idx) => (
                                <button
                                  key={`ab-theme-${idx}`}
                                  type="button"
                                  onClick={() => setAbVariantTheme(t.color)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer relative overflow-hidden"
                                  style={{
                                    background: t.color,
                                    border: abVariantTheme === t.color ? '2px solid var(--text-primary)' : '1px solid var(--border-default)',
                                  }}
                                >
                                  {abVariantTheme === t.color && <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
                                </button>
                              ))}

                              {/* Custom Color Picker for Variant B */}
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer relative border border-[var(--border-default)] overflow-hidden"
                                style={{
                                  backgroundColor: abVariantTheme.startsWith('#') && !['#4F46E5', '#10B981', '#EF4444', '#1C1917'].includes(abVariantTheme) ? abVariantTheme : '#ffffff'
                                }}
                              >
                                <input
                                  type="color"
                                  value={abVariantTheme.startsWith('#') ? abVariantTheme : '#4F46E5'}
                                  onChange={(e) => setAbVariantTheme(e.target.value)}
                                  className="absolute inset-0 w-full h-full p-0 m-0 border-0 cursor-pointer opacity-0"
                                />
                                {abVariantTheme.startsWith('#') && !['#4F46E5', '#10B981', '#EF4444', '#1C1917'].includes(abVariantTheme) ? (
                                  <Check className="w-4 h-4 text-white mix-blend-difference" strokeWidth={2} />
                                ) : (
                                  <Plus className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Variant B Template
                            </label>
                            <select
                              value={abVariantTemplate}
                              onChange={(e) => setAbVariantTemplate(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border text-xs text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                            >
                              <option value="classic">Classic</option>
                              <option value="liquid-glass">Liquid Glass</option>
                              <option value="neon-cyber">Neon Cyber</option>
                              <option value="minimalist-light">Minimalist Light</option>
                              <option value="minimalist-dark">Minimalist Dark</option>
                              <option value="modern-warm">Modern Warm</option>
                              <option value="ocean-breeze">Ocean Breeze</option>
                              <option value="retro-amber">Retro Amber</option>
                              <option value="corporate">Corporate</option>
                              <option value="aurora">Aurora Glow</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                            Variant B Custom CSS (Optional)
                          </label>
                          <textarea
                            value={abVariantCustomCss}
                            onChange={(e) => setAbVariantCustomCss(e.target.value)}
                            placeholder="/* Custom CSS for Variant B */"
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border text-xs font-mono resize-none"
                            style={{
                              borderColor: abVariantCustomCssLength > MAX_CUSTOM_CSS_LENGTH ? 'var(--status-danger)' : 'var(--border-default)',
                              backgroundColor: '#1E1B4B',
                              color: '#E5E7EB',
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-[var(--border-default)]">
                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Traffic Split (A/B)
                            </label>
                            <div className="flex items-center gap-4">
                              <input 
                                type="range" 
                                min="10" 
                                max="90" 
                                step="10" 
                                value={abTrafficSplit}
                                onChange={(e) => setAbTrafficSplit(parseInt(e.target.value))}
                                className="flex-1"
                              />
                              <div className="text-sm font-medium w-16 text-center">
                                {abTrafficSplit}% / {100 - abTrafficSplit}%
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2 text-[var(--text-primary)]">
                              Test Duration (Days)
                            </label>
                            <select 
                              value={abTestDuration}
                              onChange={(e) => setAbTestDuration(parseInt(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg border text-sm text-[var(--text-primary)] border-[var(--border-default)] bg-[var(--surface-card)]"
                            >
                              <option value={7}>7 Days</option>
                              <option value={14}>14 Days</option>
                              <option value={30}>30 Days</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className="p-6 rounded-xl space-y-4"
                    style={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]" >
                          Developer Mode
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]" >
                          Enable JavaScript API for programmatic control
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="w-5 h-5 cursor-pointer"
                        checked={developerMode}
                        onChange={(e) => setDeveloperMode(e.target.checked)}
                      />
                    </label>

                    {developerMode && (
                      <div className="space-y-4 pt-4 border-t border-[var(--border-default)]">
                        <p className="text-xs text-[var(--text-secondary)]">
                          When enabled, the banner will not auto-appear on page load. Your site controls
                          it via <code className="font-mono text-[11px]">window.Vajra</code> on the
                          live property.
                        </p>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">
                              Install snippet
                            </label>
                            <button
                              type="button"
                              onClick={() => copyDeveloperSnippet(developerInstallSnippet, 'Install snippet')}
                              className="px-2 py-1 rounded text-xs font-medium cursor-pointer"
                              style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                            >
                              Copy
                            </button>
                          </div>
                          <pre
                            className="p-3 rounded-lg text-[11px] font-mono overflow-x-auto"
                            style={{ backgroundColor: '#1E1B4B', color: '#E2E8F0' }}
                          >
                            {developerInstallSnippet}
                          </pre>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">
                              JavaScript API usage
                            </label>
                            <button
                              type="button"
                              onClick={() => copyDeveloperSnippet(developerApiSnippet, 'API example')}
                              className="px-2 py-1 rounded text-xs font-medium cursor-pointer"
                              style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                            >
                              Copy
                            </button>
                          </div>
                          <pre
                            className="p-3 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap"
                            style={{ backgroundColor: '#1E1B4B', color: '#E2E8F0' }}
                          >
                            {developerApiSnippet}
                          </pre>
                        </div>

                        {!activeProp && (
                          <p className="text-xs text-[var(--status-warning)]">
                            Select a property in Basic Information to pre-fill the install snippet with your property ID.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <BannerInstallDocSection
                    apiPublicBase={publicApiBase}
                    propertyId={activeProp?.id || ''}
                    developerMode={developerMode}
                    consentWebhookUrl={consentWebhookUrl}
                    installSnippet={developerInstallSnippet}
                    apiSnippet={developerApiSnippet}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-8 py-6 flex items-center justify-between border-t border-[var(--border-default)]"
          >
            <div>
              {currentStep > 1 && (
                <button
                  onClick={handlePrevious}
                  className="px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                  Previous
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 text-[var(--status-danger)] cursor-pointer"
                style={{border: '1px solid var(--status-danger)'}}
              >
                Cancel
              </button>
              {currentStep === 6 ? (
                <>
                  <button
                    onClick={() => handleSave('Draft')}
                    disabled={isSubmitting || isCustomCssTooLong}
                    className="px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                  >
                    <Save className="w-4 h-4" strokeWidth={1.5} />
                    {isSubmitting ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={isSubmitting || isCustomCssTooLong}
                    className="px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 bg-[var(--status-success)] text-white cursor-pointer disabled:opacity-50"
                  >
                    <Rocket className="w-4 h-4" strokeWidth={1.5} />
                    Publish Banner
                  </button>
                </>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      {showPublishModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowPublishModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-8 bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--status-success-bg)' }}
              >
                <Check className="w-8 h-8 text-[var(--status-success)]"  strokeWidth={2} />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[var(--text-primary)]" >
                Banner ready to publish
              </h3>
              <p className="text-sm mb-6 text-[var(--text-secondary)]" >
                This banner will be deployed to {selectedProperties.join(', ') || 'your properties'} immediately. All existing user consents remain valid.
              </p>

              <div
                className="w-full p-4 rounded-xl mb-6"
                style={{
                  backgroundColor: 'var(--status-success-bg)',
                  border: '1px solid var(--status-success)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    <StatuteTextLink label="DPDPA Section 5 Notice" />
                  </div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    <StatuteTextLink label="DPDPA Section 6 Consent" />
                  </div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    <span>Multi-language ready</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    <span>Withdrawal URL configured</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    <span>Audit Log integration active</span>
                  </div>
                </div>
              </div>

              <div
                className="w-full px-3 py-2 rounded-lg text-sm font-mono mb-6"
                style={{ backgroundColor: 'var(--surface-raised)', color: 'var(--text-tertiary)' }}
              >
                BANNER-2026-A8B3
              </div>

              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  disabled={isSubmitting}
                  className="w-full px-6 py-2 rounded-lg text-sm font-medium hover:bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('Live', false)}
                  disabled={isSubmitting || isCustomCssTooLong}
                  className="w-full px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish only (don\'t deploy)'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('Live', true)}
                  disabled={isSubmitting || isCustomCssTooLong}
                  className="w-full px-6 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 bg-[var(--brand-primary)] text-white cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish & Deploy'}
                  <Rocket className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
