import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthGate } from '@/router/AuthGate';
import { LoginRoute, RootRedirect, SignupRoute, ChangePasswordRoute, PendingApprovalRoute } from '@/router/AuthRoutes';
import { ProtectedRoute } from '@/router/ProtectedRoute';
import { RoleGuard } from '@/router/RoleGuard';
import { BannerBuilderDashboardRoute } from '@/router/wrappers/BannerBuilderDashboardRoute';
import { BreachIncidentsListRoute } from '@/router/wrappers/BreachIncidentsListRoute';
import { ConsentCopilotRoute } from '@/router/wrappers/ConsentCopilotRoute';
import { ConsentNoticesManagerRoute } from '@/router/wrappers/ConsentNoticesManagerRoute';
import { NoticeApprovalsRoute } from '@/router/wrappers/NoticeApprovalsRoute';
import { IncidentDetailRoute } from '@/router/wrappers/IncidentDetailRoute';
import { IntegrationsOverviewRoute } from '@/router/wrappers/IntegrationsOverviewRoute';
import { NewConsentNoticeRoute } from '@/router/wrappers/NewConsentNoticeRoute';
import { PropertyDetailRoute } from '@/router/wrappers/PropertyDetailRoute';
import { PropertyManagementRoute } from '@/router/wrappers/PropertyManagementRoute';
import { TechnicalIntegrationRoute } from '@/router/wrappers/TechnicalIntegrationRoute';
import { PageLoader } from '@/components/PageLoader';
import { lazyRetry } from '@/router/lazyRetry';
import { RouteErrorFallback } from '@/router/RouteErrorFallback';

function withSuspense(node: ReactNode): ReactElement {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>;
}

const DataRightsPortalPublic = lazy(() =>
  import('@/app/components/pages/DataRightsPortalPublic').then((m) => ({
    default: m.DataRightsPortalPublic,
  })),
);
const EmailConsentCampaignPublic = lazy(() =>
  import('@/app/components/pages/EmailConsentCampaignPublic').then((m) => ({
    default: m.EmailConsentCampaignPublic,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import('@/app/components/auth/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import('@/app/components/auth/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);

const HowToUse = lazy(() =>
  import('@/app/components/pages/HowToUse').then((m) => ({ default: m.HowToUse })),
);

const Dashboard = lazy(() =>
  import('@/app/components/pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const ComplianceScoreDeepDive = lazy(() =>
  import('@/app/components/pages/ComplianceScoreDeepDive').then((m) => ({
    default: m.ComplianceScoreDeepDive,
  })),
);
const AutomationCoverage = lazy(() =>
  import('@/app/components/pages/AutomationCoverage').then((m) => ({
    default: m.AutomationCoverage,
  })),
);
const PurposeRegistryNew = lazy(() =>
  import('@/app/components/pages/PurposeRegistryNew').then((m) => ({
    default: m.PurposeRegistryNew,
  })),
);
const CookieTrackerManager = lazy(() =>
  import('@/app/components/pages/CookieTrackerManager').then((m) => ({
    default: m.CookieTrackerManager,
  })),
);
const CookieScanner = lazy(() =>
  import('@/app/components/pages/CookieScanner').then((m) => ({ default: m.CookieScanner })),
);
const MultiLanguageEditor = lazy(() =>
  import('@/app/components/pages/MultiLanguageEditor').then((m) => ({
    default: m.MultiLanguageEditor,
  })),
);
const ConsentWithdrawalFlow = lazy(() =>
  import('@/app/components/pages/ConsentWithdrawalFlow').then((m) => ({
    default: m.ConsentWithdrawalFlow,
  })),
);
const NoticeDeliveryChannels = lazy(() =>
  import('@/app/components/pages/NoticeDeliveryChannels').then((m) => ({
    default: m.NoticeDeliveryChannels,
  })),
);
const ConsentCampaignsPage = lazy(() =>
  import('@/app/components/pages/ConsentCampaignsPage').then((m) => ({
    default: m.ConsentCampaignsPage,
  })),
);
const PluggableProviderAdapters = lazy(() =>
  import('@/app/components/pages/PluggableProviderAdapters').then((m) => ({
    default: m.PluggableProviderAdapters,
  })),
);
const ProofVault = lazy(() =>
  import('@/app/components/pages/ProofVault').then((m) => ({ default: m.ProofVault })),
);
const ConsentEnforcement = lazy(() =>
  import('@/app/components/pages/ConsentEnforcement').then((m) => ({
    default: m.ConsentEnforcement,
  })),
);
const ConsentManagerIntegration = lazy(() =>
  import('@/app/components/pages/ConsentManagerIntegration').then((m) => ({
    default: m.ConsentManagerIntegration,
  })),
);
const ReceivedConsents = lazy(() =>
  import('@/app/components/pages/ReceivedConsents').then((m) => ({ default: m.ReceivedConsents })),
);
const DSARSLATracker = lazy(() =>
  import('@/app/components/pages/DSARSLATracker').then((m) => ({ default: m.DSARSLATracker })),
);
const LegitimateUseRegistry = lazy(() =>
  import('@/app/components/pages/LegitimateUseRegistry').then((m) => ({ default: m.LegitimateUseRegistry })),
);
const RegulatoryProceedings = lazy(() =>
  import('@/app/components/pages/RegulatoryProceedings').then((m) => ({ default: m.RegulatoryProceedings })),
);
const DsarActivityLog = lazy(() =>
  import('@/app/components/pages/DsarActivityLog').then((m) => ({ default: m.DsarActivityLog })),
);
const BreachDisclosureWizard = lazy(() =>
  import('@/app/components/pages/BreachDisclosureWizard').then((m) => ({
    default: m.BreachDisclosureWizard,
  })),
);
const DataSources = lazy(() =>
  import('@/app/components/pages/DataSources').then((m) => ({ default: m.DataSources })),
);
const DataInventory = lazy(() =>
  import('@/app/components/pages/DataInventory').then((m) => ({ default: m.DataInventory })),
);
const RetentionPolicyManager = lazy(() =>
  import('@/app/components/pages/RetentionPolicyManager').then((m) => ({
    default: m.RetentionPolicyManager,
  })),
);
const ChildrensData = lazy(() =>
  import('@/app/components/pages/ChildrensData').then((m) => ({ default: m.ChildrensData })),
);
const PIIScannerDashboard = lazy(() =>
  import('@/app/components/pages/PIIScannerDashboard').then((m) => ({
    default: m.PIIScannerDashboard,
  })),
);
const DataAnonymisation = lazy(() =>
  import('@/app/components/pages/DataAnonymisation').then((m) => ({
    default: m.DataAnonymisation,
  })),
);
const DataMasking = lazy(() =>
  import('@/app/components/pages/DataMasking').then((m) => ({ default: m.DataMasking })),
);
const DPDPAComplianceMap = lazy(() =>
  import('@/app/components/pages/DPDPAComplianceMap').then((m) => ({
    default: m.DPDPAComplianceMap,
  })),
);
const SecuritySafeguardsHub = lazy(() =>
  import('@/app/components/pages/SecuritySafeguardsHub').then((m) => ({
    default: m.SecuritySafeguardsHub,
  })),
);
const AuditLog = lazy(() =>
  import('@/app/components/pages/AuditLog').then((m) => ({ default: m.AuditLog })),
);
const ComplianceDashboardBuilder = lazyRetry(
  () =>
    import('@/app/components/pages/ComplianceDashboardBuilder').then((m) => ({
      default: m.ComplianceDashboardBuilder,
    })),
  'ComplianceDashboardBuilder',
);
const RegulatoryReportsPage = lazy(() =>
  import('@/app/components/pages/RegulatoryReportsPage').then((m) => ({
    default: m.RegulatoryReportsPage,
  })),
);
const DPIAModule = lazy(() =>
  import('@/app/components/pages/DPIAModule').then((m) => ({ default: m.DPIAModule })),
);
const RoPAModule = lazy(() =>
  import('@/app/components/pages/RoPAModule').then((m) => ({ default: m.RoPAModule })),
);
const CrossBorderTransfer = lazy(() =>
  import('@/app/components/pages/CrossBorderTransfer').then((m) => ({ default: m.CrossBorderTransfer })),
);
const CISOCommandCenter = lazyRetry(
  () =>
    import('@/app/components/pages/CISOCommandCenter').then((m) => ({
      default: m.CISOCommandCenter,
    })),
  'CISOCommandCenter',
);
const PolicyManager = lazy(() =>
  import('@/app/components/pages/PolicyManager').then((m) => ({ default: m.PolicyManager })),
);
const VendorRiskIntelligence = lazyRetry(
  () =>
    import('@/app/components/pages/VendorRiskIntelligence').then((m) => ({
      default: m.VendorRiskIntelligence,
    })),
  'VendorRiskIntelligence',
);
const GovernanceGuide = lazy(() =>
  import('@/app/components/pages/GovernanceGuide').then((m) => ({ default: m.GovernanceGuide })),
);
const DataProtectionGuide = lazy(() =>
  import('@/app/components/pages/DataProtectionGuide').then((m) => ({
    default: m.DataProtectionGuide,
  })),
);
const ComplianceGuide = lazy(() =>
  import('@/app/components/pages/ComplianceGuide').then((m) => ({ default: m.ComplianceGuide })),
);
const WorkspaceInfo = lazy(() =>
  import('@/app/components/pages/WorkspaceInfo').then((m) => ({ default: m.WorkspaceInfo })),
);
const DeploymentSettings = lazy(() =>
  import('@/app/components/pages/DeploymentSettings').then((m) => ({
    default: m.DeploymentSettings,
  })),
);
const IndustryConfig = lazy(() =>
  import('@/app/components/pages/IndustryConfig').then((m) => ({ default: m.IndustryConfig })),
);
const BankIdentifierSettings = lazy(() =>
  import('@/app/components/pages/BankConsentModules').then((m) => ({ default: m.BankIdentifierSettings })),
);
const BankJourneyMapping = lazy(() =>
  import('@/app/components/pages/BankConsentModules').then((m) => ({ default: m.BankJourneyMapping })),
);
const BankCustomerConsentRegistry = lazy(() =>
  import('@/app/components/pages/BankConsentModules').then((m) => ({ default: m.BankCustomerConsentRegistry })),
);
const BranchConsentCapture = lazy(() =>
  import('@/app/components/pages/AssistedConsentCapture').then((m) => ({ default: m.BranchConsentCapture })),
);
const MerchantConsentCapture = lazy(() =>
  import('@/app/components/pages/AssistedConsentCapture').then((m) => ({ default: m.MerchantConsentCapture })),
);
const DPDPRoleMapping = lazy(() =>
  import('@/app/components/pages/DPDPRoleMapping').then((m) => ({ default: m.DPDPRoleMapping })),
);
const ApiWebhooks = lazy(() =>
  import('@/app/components/pages/ApiWebhooks').then((m) => ({ default: m.ApiWebhooks })),
);
const TagManager = lazy(() =>
  import('@/app/components/pages/TagManager').then((m) => ({ default: m.TagManager })),
);
const OrganizationManagement = lazy(() =>
  import('@/app/components/pages/OrganizationManagement').then((m) => ({
    default: m.OrganizationManagement,
  })),
);
const TeamManagement = lazy(() =>
  import('@/app/components/pages/TeamManagement').then((m) => ({ default: m.TeamManagement })),
);
const PendingApprovals = lazy(() =>
  import('@/app/components/pages/PendingApprovals').then((m) => ({
    default: m.PendingApprovals,
  })),
);
const PublicGovernanceDashboardPage = lazy(() =>
  import('@/app/components/governance-dashboards/PublicGovernanceDashboardPage').then((m) => ({
    default: m.PublicGovernanceDashboardPage,
  })),
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/portal/:orgSlug',
    element: withSuspense(<DataRightsPortalPublic />),
  },
  {
    path: '/consent-campaign/:token',
    element: withSuspense(<EmailConsentCampaignPublic />),
  },
  {
    path: '/compliance/dashboards/public/:token',
    element: withSuspense(<PublicGovernanceDashboardPage />),
  },
  {
    path: '/login',
    element: <LoginRoute />,
  },
  {
    path: '/signup',
    element: <SignupRoute />,
  },
  {
    path: '/forgot-password',
    element: withSuspense(<ForgotPasswordPage />),
  },
  {
    path: '/reset-password',
    element: withSuspense(<ResetPasswordPage />),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/change-password',
        element: <ChangePasswordRoute />,
      },
      {
        path: '/pending-approval',
        element: <PendingApprovalRoute />,
      },
      {
        element: <AuthGate />,
        children: [
          {
            element: <AppLayout />,
            errorElement: <RouteErrorFallback />,
            children: [
              { path: '/how-to-use', element: <HowToUse /> },
              { path: '/dashboard', element: <Dashboard /> },
              { path: '/compliance/score', element: <ComplianceScoreDeepDive /> },
              { path: '/overview/automation', element: <AutomationCoverage /> },
              { path: '/consent/banner', element: <BannerBuilderDashboardRoute /> },
              { path: '/consent/notices', element: <ConsentNoticesManagerRoute /> },
              { path: '/consent/notices/approvals', element: <NoticeApprovalsRoute /> },
              { path: '/consent/notices/new', element: <NewConsentNoticeRoute /> },
              {
                path: '/consent/notices/:noticeId/edit/:versionId',
                element: <NewConsentNoticeRoute />,
              },
              { path: '/consent/purposes', element: <PurposeRegistryNew /> },
              { path: '/consent/languages', element: <MultiLanguageEditor /> },
              { path: '/consent/withdrawal', element: <ConsentWithdrawalFlow /> },
              { path: '/consent/channels', element: <NoticeDeliveryChannels /> },
              { path: '/consent/campaigns', element: <ConsentCampaignsPage /> },
              { path: '/consent/provider-adapters', element: <PluggableProviderAdapters /> },
              { path: '/consent/integration', element: <ConsentManagerIntegration /> },
              { path: '/consent/received', element: withSuspense(<ReceivedConsents />) },
              { path: '/consent/proof-vault', element: <ProofVault /> },
              { path: '/consent/enforcement', element: <ConsentEnforcement /> },
              { path: '/consent/banking/identifiers', element: withSuspense(<BankIdentifierSettings />) },
              { path: '/consent/banking/journeys', element: withSuspense(<BankJourneyMapping />) },
              { path: '/consent/banking/registry', element: withSuspense(<BankCustomerConsentRegistry />) },
              { path: '/consent/banking/branch-capture', element: withSuspense(<BranchConsentCapture />) },
              { path: '/consent/banking/merchant-capture', element: withSuspense(<MerchantConsentCapture />) },
              { path: '/scanner/cookies/manager', element: <CookieTrackerManager /> },
              { path: '/scanner/cookies', element: <CookieScanner /> },
              { path: '/integrations', element: <IntegrationsOverviewRoute /> },
              { path: '/integrations/website', element: <PropertyManagementRoute filterType="website" /> },
              {
                path: '/integrations/website/:propertyId',
                element: <PropertyDetailRoute filterType="website" />,
              },
              { path: '/integrations/mobile', element: <PropertyManagementRoute filterType="mobile" /> },
              {
                path: '/integrations/mobile/:propertyId',
                element: <PropertyDetailRoute filterType="mobile" />,
              },
              { path: '/integrations/api', element: <ApiWebhooks /> },
              { path: '/integrations/tag-manager', element: <TagManager /> },
              { path: '/integrations/dsar-widget', element: <TechnicalIntegrationRoute defaultTab="dsar-widget" /> },
              { path: '/integrations/preference-center', element: <TechnicalIntegrationRoute defaultTab="preference-center" /> },
              { path: '/integrations/pii-agent', element: <TechnicalIntegrationRoute defaultTab="pii-agent" /> },
              { path: '/integrations/campaign-tracking', element: <TechnicalIntegrationRoute defaultTab="campaign-tracking" /> },
              { path: '/integrations/technical', element: <TechnicalIntegrationRoute defaultTab="website" /> },
              { path: '/data-protection/guide', element: <DataProtectionGuide /> },
              { path: '/data/inventory', element: <DataInventory /> },
              { path: '/scanner/pii', element: <PIIScannerDashboard /> },
              { path: '/data/masking', element: <DataMasking /> },
              { path: '/data/anonymisation', element: <DataAnonymisation /> },
              { path: '/scanner/anonymisation', element: <Navigate to="/data/anonymisation" replace /> },
              { path: '/data/sources', element: <DataSources /> },
              { path: '/data/retention', element: <RetentionPolicyManager /> },
              { path: '/data/children', element: <ChildrensData /> },
              { path: '/rights/portal', element: <DataRightsPortalPublic /> },
              { path: '/rights/tracker', element: <DSARSLATracker /> },
              { path: '/rights/grievances', element: <Navigate to="/rights/tracker?right=grievance" replace /> },
              { path: '/rights/nominations', element: <Navigate to="/rights/tracker?right=nomination" replace /> },
              {
                path: '/rights/logs',
                element: (
                  <RoleGuard
                    allowedRoles={['admin', 'superadmin', 'compliance_officer', 'auditor', 'dpo']}
                    featureName="DSAR Activity Log"
                  >
                    <DsarActivityLog />
                  </RoleGuard>
                ),
              },
              { path: '/compliance/guide', element: <ComplianceGuide /> },
              { path: '/compliance/map', element: <DPDPAComplianceMap /> },
              { path: '/security/safeguards', element: <SecuritySafeguardsHub /> },
              { path: '/breach', element: <BreachIncidentsListRoute /> },
              { path: '/breach/:incidentId', element: <IncidentDetailRoute /> },
              { path: '/breach/:incidentId/wizard', element: <BreachDisclosureWizard /> },
              { path: '/audit/log', element: <AuditLog /> },
              { path: '/governance/guide', element: <GovernanceGuide /> },
              { path: '/compliance/dashboards', element: withSuspense(<ComplianceDashboardBuilder />) },
              { path: '/compliance/reports', element: <RegulatoryReportsPage /> },
              { path: '/data/dpia', element: <DPIAModule /> },
              { path: '/data/ropa', element: <RoPAModule /> },
              { path: '/governance/cross-border-transfer', element: <CrossBorderTransfer /> },
              {
                path: '/governance/advanced/legitimate-use',
                element: withSuspense(<LegitimateUseRegistry />),
              },
              {
                path: '/governance/advanced/regulatory-proceedings',
                element: withSuspense(<RegulatoryProceedings />),
              },
              {
                path: '/governance/legitimate-use',
                element: <Navigate to="/governance/advanced/legitimate-use" replace />,
              },
              {
                path: '/governance/regulatory-proceedings',
                element: <Navigate to="/governance/advanced/regulatory-proceedings" replace />,
              },
              { path: '/security/ciso', element: withSuspense(<CISOCommandCenter />) },
              { path: '/data/policies', element: <PolicyManager /> },
              { path: '/data/vendors', element: <VendorRiskIntelligence /> },
              { path: '/settings/workspace', element: <WorkspaceInfo /> },
              { path: '/settings/deployment', element: <DeploymentSettings /> },
              { path: '/settings/industry', element: <IndustryConfig /> },
              { path: '/settings/role-mapping', element: <DPDPRoleMapping /> },
              { path: '/ai/copilot', element: <ConsentCopilotRoute /> },
              {
                path: '/superadmin/tenants',
                element: (
                  <RoleGuard
                    allowedRoles={['superadmin']}
                    featureName="Organization Management"
                  >
                    <OrganizationManagement />
                  </RoleGuard>
                ),
              },
              {
                path: '/superadmin/users',
                element: (
                  <RoleGuard
                    allowedRoles={['admin', 'superadmin']}
                    featureName="Team Management"
                  >
                    <TeamManagement />
                  </RoleGuard>
                ),
              },
              {
                path: '/superadmin/approvals',
                element: (
                  <RoleGuard
                    allowedRoles={['superadmin']}
                    featureName="Pending Approvals"
                  >
                    <PendingApprovals />
                  </RoleGuard>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <RootRedirect />,
  },
]);
