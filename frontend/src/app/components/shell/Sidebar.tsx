import type { ReactElement, MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Baby,
  BookOpen,
  Building,
  Building2,
  Compass,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Code,
  Database,
  FileCheck,
  FileText,
  Gauge,
  Gavel,
  GitBranch,
  Globe,
  HeartPulse,
  Home,
  LayoutGrid,
  LayoutPanelTop,
  Layers,
  List,
  Lock,
  LockKeyhole,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Scale,
  ScrollText,
  Search as SearchIcon,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  User,
  Users,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User as AuthUser } from '@/types/auth';
import { useAuth } from '@/contexts/AuthContext';
import { displayName, roleLabel, userInitials } from '@/lib/auth/display';
import { canManageOrganizations, canManageUsers, hasRole } from '@/lib/auth/permissions';
import { notify } from '@/app/utils/notify';
import { useLocation, useNavigate } from 'react-router';
import { getLabelForPath, getPathForLabel } from '@/router/pathMap';
import { useNavigationGuard } from '@/router/NavigationGuardContext';
import { fetchChildSummary } from '@/lib/api/childData';
import { fetchLegitimateUseSummary } from '@/lib/api/legitimateUse';
import { fetchPiiSummary } from '@/lib/api/piiScan';
import { fetchRegulatoryProceedingSummary } from '@/lib/api/regulatoryProceedings';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';

interface NavItem {
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeType?: 'danger' | 'warning';
}

interface NavSectionProps {
  title: string;
  items: NavItem[];
  activeItem: string;
  onItemClick: (label: string) => void;
}

interface CollapsibleNavSectionProps extends NavSectionProps {
  /** Whether the section starts expanded. */
  defaultOpen?: boolean;
  /** Sidebar is in icon-only collapsed mode. */
  collapsed?: boolean;
  /** Filter items shown in the nav list. */
  searchQuery?: string;
}

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  collapsed?: boolean;
  onClick: () => void;
  className?: string;
}

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_WIDTH_STORAGE_KEY = 'dpdpa-sidebar-width';

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function matchesNavSearch(label: string, sectionTitle: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    label.toLowerCase().includes(q) ||
    sectionTitle.toLowerCase().includes(q)
  );
}

function integrationsHasResults(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  if ('integrations'.includes(q)) {
    return true;
  }
  if (matchesNavSearch('Integrations Overview', 'Integrations', query)) {
    return true;
  }
  if (matchesNavSearch('DPDPA Consent Managers', 'Integrations', query)) {
    return true;
  }
  if (matchesNavSearch('Technical Integration', 'Integrations', query)) {
    return true;
  }
  return TECHNICAL_INTEGRATION_ITEMS.some((item) =>
    matchesNavSearch(`Technical Integration - ${item.label}`, 'Integrations', query),
  );
}

function vajraAiMatchesSearch(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return q.includes('shield') || q.includes('ai') || q.includes('copilot');
}

function filterNavItems(items: NavItem[], sectionTitle: string, query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  if (sectionTitle.toLowerCase().includes(q)) {
    return items;
  }
  return items.filter((item) => item.label.toLowerCase().includes(q));
}

function navSectionsHaveResults(
  query: string,
  sections: Array<{ title: string; items: NavItem[] }>,
): boolean {
  if (!query.trim()) {
    return true;
  }
  return sections.some(({ title, items }) => filterNavItems(items, title, query).length > 0);
}

function navItemClassName(isActive: boolean, collapsed?: boolean): string {
  return cn(
    'w-full flex items-center gap-[11px] rounded-[9px] text-[13.5px] transition-[background,box-shadow,color] duration-150',
    collapsed ? 'justify-center px-2 py-[9px]' : 'px-[11px] py-[9px]',
    isActive
      ? 'bg-[var(--sidebar-active)] text-white font-semibold shadow-[var(--sidebar-active-glow)] [&_svg]:opacity-100'
      : 'text-[var(--sidebar-text)] hover:bg-white/5 [&_svg]:opacity-85',
  );
}

function NavItemBadge({ item, isActive }: { item: NavItem; isActive: boolean }): ReactElement | null {
  if (!item.badge) {
    return null;
  }

  if (item.badgeType === 'danger') {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-[var(--status-danger)] px-2 py-0.5 text-[10px] font-semibold text-white">
        {item.badge}
      </span>
    );
  }

  if (item.badgeType === 'warning') {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-[var(--status-warning)] px-2 py-0.5 text-[10px] font-semibold text-white">
        {item.badge}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'ml-auto shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide',
        isActive ? 'bg-white/22 text-white' : 'bg-white/14 text-[var(--sidebar-text)]',
      )}
    >
      {item.badge}
    </span>
  );
}

function NavItemButton({
  item,
  isActive,
  collapsed,
  onClick,
  className,
}: NavItemButtonProps): ReactElement {
  const Icon = item.icon;

  return (
    <button
      type="button"
      title={collapsed ? item.label : undefined}
      onClick={onClick}
      className={cn(navItemClassName(isActive, collapsed), className)}
    >
      <Icon className="size-[17px] shrink-0" strokeWidth={2} />
      {!collapsed ? (
        <>
          <span className="min-w-0 truncate text-left">{item.label}</span>
          <NavItemBadge item={item} isActive={isActive} />
        </>
      ) : null}
    </button>
  );
}

const OVERVIEW_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: Home },
  { label: 'Compliance Score', icon: Gauge },
  { label: 'Automation Coverage', icon: LayoutGrid, badge: 'New' },
];

const HEALTHCARE_SHIELD_ITEMS: NavItem[] = [
  { label: 'Patient Consent Portal', icon: HeartPulse, badge: 'New' },
  { label: 'Clinician Access View', icon: Stethoscope },
  { label: 'DPO Audit Dashboard', icon: ShieldCheck },
];

const CONSENT_MANAGEMENT_ITEMS: NavItem[] = [
  { label: 'Pluggable Provider Adapters', icon: Settings },
  { label: 'Purpose Registry', icon: List },
  { label: 'Consent Notices Manager', icon: FileText },
  { label: 'Consent Campaigns', icon: Send },
  { label: 'Create Consent', icon: LayoutPanelTop },
  { label: 'Multi-Language Editor', icon: Globe },
  { label: 'Received Consents', icon: ClipboardList },
  { label: 'Proof Vault', icon: LockKeyhole },
  { label: 'Consent Enforcement', icon: ShieldCheck },
  { label: 'Cookie & Tracker Manager', icon: Globe },
  { label: 'Notice Delivery Channels', icon: Send },
  { label: 'Consent Withdrawal Flow', icon: User },
];

const BANKING_CONSENT_ITEMS: NavItem[] = [
  { label: 'Bank Identifier Settings', icon: Building },
  { label: 'Journey & Channel Mapping', icon: GitBranch },
  { label: 'Branch Consent Capture', icon: Building },
  { label: 'Merchant Consent Capture', icon: Users },
  { label: 'Customer Consent Registry', icon: Users },
];

const COMPLIANCE_ITEMS: NavItem[] = [
  { label: 'Compliance Guide', icon: ClipboardCheck, badge: 'Start' },
  { label: 'DPDPA Map', icon: Scale },
  { label: 'Security Safeguards', icon: Shield },
  { label: 'Breach Disclosure Wizard', icon: AlertTriangle },
  { label: 'Audit Log (New)', icon: Clock },
];

const TECHNICAL_INTEGRATION_ITEMS: NavItem[] = [
  { label: 'Website', icon: Code },
  { label: 'Mobile SDK', icon: Smartphone },
  { label: 'Tag Manager', icon: Tag },
  { label: 'API & Webhooks', icon: Webhook },
];

function getDataProtectionItems(recordsCount: number | null, activeScanCount: number | null): NavItem[] {
  return [
    { label: 'Data Protection Guide', icon: Layers, badge: 'Start' },
    { label: 'Data Sources', icon: Plug },
    { label: 'Data Inventory', icon: Database },
    {
      label: 'PII Scanner',
      icon: SearchIcon,
      badge: activeScanCount ? `${activeScanCount} active` : undefined,
      badgeType: undefined,
    },
    { label: 'Data Masking', icon: Lock },
    { label: 'Data Anonymisation', icon: Shield },
    { label: 'Retention Policies', icon: Clock },
    { 
      label: "Children's Data", 
      icon: Baby, 
      badge: recordsCount !== null ? `${recordsCount} record${recordsCount === 1 ? '' : 's'}` : undefined, 
      badgeType: 'warning' 
    },
  ];
}

const DATA_PRINCIPAL_RIGHTS_BASE_ITEMS: NavItem[] = [
  { label: 'Rights Portal (Public)', icon: User },
  { label: 'DSAR SLA Tracker', icon: Clock },
];

function getDataPrincipalRightsItems(authUser: AuthUser | null): NavItem[] {
  const items = [...DATA_PRINCIPAL_RIGHTS_BASE_ITEMS];
  if (hasRole(authUser, 'admin', 'superadmin')) {
    items.push({ label: 'Logs', icon: ScrollText });
  }
  return items;
}

const GOVERNANCE_ITEMS: NavItem[] = [
  { label: 'Governance Guide', icon: Compass, badge: 'Start' },
  { label: 'RoPA Module', icon: BookOpen },
  { label: 'DPIA Module', icon: FileCheck },
  { label: 'Policy Manager', icon: BookOpen },
  { label: 'Vendor Risk Intelligence', icon: Building, badge: '2 high risk', badgeType: 'danger' },
  { label: 'Cross-Border Transfer', icon: Globe },
  { label: 'CISO Command Center', icon: ShieldCheck },
  { label: 'Compliance Dashboards', icon: Gauge },
  // { label: 'Monitoring & Scheduling', icon: Calendar }, // DISABLED — prototype page
];

function getAdvancedGovernanceItems(
  dueForReview: number | null,
  overdueProceedings: number | null,
): NavItem[] {
  return [
    {
      label: 'Legitimate Use Registry',
      icon: Scale,
      badge: dueForReview ? `${dueForReview} due` : undefined,
      badgeType: dueForReview ? 'warning' : undefined,
    },
    {
      label: 'Regulatory Proceedings',
      icon: Gavel,
      badge: overdueProceedings ? `${overdueProceedings} overdue` : undefined,
      badgeType: overdueProceedings ? 'warning' : undefined,
    },
  ];
}

const SETTINGS_ITEMS: NavItem[] = [
  { label: 'Workspace Info', icon: Building2 },
  { label: 'Deployment Settings', icon: Settings },
  { label: 'Industry Config', icon: Building },
  { label: 'DPDP Role Mapping', icon: Shield },
];

function getAdministrationNavItems(authUser: AuthUser | null): NavItem[] {
  const items: NavItem[] = [];
  if (canManageOrganizations(authUser)) {
    items.push({ label: 'Organizations', icon: Building2 });
    items.push({ label: 'Pending Approvals', icon: Clock });
  }
  if (canManageUsers(authUser)) {
    items.push({ label: 'Team & Users', icon: Users });
  }
  return items;
}

function readStoredSidebarWidth(): number {
  if (typeof window === 'undefined') {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (!stored) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  const parsed = Number.parseInt(stored, 10);
  if (Number.isNaN(parsed)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

/**
 * Renders a collapsible sidebar group; items are hidden until the header is clicked.
 */
function CollapsibleNavSection({
  title,
  items,
  activeItem,
  onItemClick,
  defaultOpen = false,
  collapsed = false,
  searchQuery = '',
}: CollapsibleNavSectionProps): ReactElement | null {
  const visibleItems = filterNavItems(items, title, searchQuery);
  if (searchQuery.trim() && visibleItems.length === 0) {
    return null;
  }

  const hasActiveChild = visibleItems.some((item) => item.label === activeItem);
  const [open, setOpen] = useState(defaultOpen || hasActiveChild);
  const searchActive = searchQuery.trim().length > 0;
  const isOpen = collapsed || open || (searchActive && visibleItems.length > 0);

  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  return (
    <div className="mb-[18px]">
      {!collapsed ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="group mb-2 flex w-full items-center justify-between px-2 py-0.5 transition-colors"
        >
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sidebar-muted)]">
            {title}
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-[var(--sidebar-muted)] transition-transform duration-200',
              'opacity-0 group-hover:opacity-100',
              isOpen && 'rotate-180 opacity-100',
            )}
            strokeWidth={2}
          />
        </button>
      ) : null}
      {isOpen ? (
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <NavItemButton
              key={item.label}
              item={item}
              isActive={activeItem === item.label}
              collapsed={collapsed}
              onClick={() => onItemClick(item.label)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface IntegrationsNavSectionProps {
  activeItem: string;
  onItemClick: (label: string) => void;
  collapsed?: boolean;
  searchQuery?: string;
}

/**
 * Integrations group with nested technical integration channels.
 */
function IntegrationsNavSection({
  activeItem,
  onItemClick,
  collapsed = false,
  searchQuery = '',
}: IntegrationsNavSectionProps): ReactElement | null {
  const sectionTitle = 'Integrations';
  const q = searchQuery.trim().toLowerCase();
  const sectionMatches = !q || sectionTitle.toLowerCase().includes(q);

  const overviewVisible =
    sectionMatches || matchesNavSearch('Integrations Overview', sectionTitle, searchQuery);
  const consentManagersVisible =
    sectionMatches || matchesNavSearch('DPDPA Consent Managers', sectionTitle, searchQuery);
  const technicalParentVisible =
    sectionMatches ||
    matchesNavSearch('Technical Integration', sectionTitle, searchQuery);
  const visibleTechnicalItems = TECHNICAL_INTEGRATION_ITEMS.filter((item) => {
    const nestedLabel = `Technical Integration - ${item.label}`;
    return sectionMatches || matchesNavSearch(nestedLabel, sectionTitle, searchQuery);
  });
  const technicalVisible = technicalParentVisible || visibleTechnicalItems.length > 0;

  if (q && !overviewVisible && !consentManagersVisible && !technicalVisible) {
    return null;
  }

  const integrationLabels = [
    'Integrations Overview',
    'Technical Integration',
    // 'DPDPA Consent Managers',
    ...TECHNICAL_INTEGRATION_ITEMS.map((item) => `Technical Integration - ${item.label}`),
  ];
  const hasActiveChild = integrationLabels.includes(activeItem);
  const [open, setOpen] = useState(hasActiveChild);
  const [technicalExpanded, setTechnicalExpanded] = useState(
    activeItem === 'Technical Integration' || activeItem.startsWith('Technical Integration -'),
  );
  const searchActive = q.length > 0;
  const isOpen = collapsed || open || searchActive;

  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  useEffect(() => {
    if (searchActive && visibleTechnicalItems.length > 0) {
      setTechnicalExpanded(true);
    }
  }, [searchActive, visibleTechnicalItems.length]);

  const isTechnicalActive =
    activeItem === 'Technical Integration' || activeItem.startsWith('Technical Integration -');

  return (
    <div className="mb-[18px]">
      {!collapsed ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="group mb-2 flex w-full items-center justify-between px-2 py-0.5 transition-colors"
        >
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sidebar-muted)]">
            Integrations
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-[var(--sidebar-muted)] transition-transform duration-200',
              'opacity-0 group-hover:opacity-100',
              isOpen && 'rotate-180 opacity-100',
            )}
            strokeWidth={2}
          />
        </button>
      ) : null}
      {isOpen ? (
        <div className="space-y-0.5">
          {overviewVisible ? (
            <NavItemButton
              item={{ label: 'Integrations Overview', icon: Plug }}
              isActive={activeItem === 'Integrations Overview'}
              collapsed={collapsed}
              onClick={() => onItemClick('Integrations Overview')}
            />
          ) : null}

          {technicalVisible ? (
            collapsed ? (
              <NavItemButton
                item={{ label: 'Technical Integration', icon: Code }}
                isActive={isTechnicalActive}
                collapsed={collapsed}
                onClick={() => onItemClick('Technical Integration')}
              />
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setTechnicalExpanded((prev) => !prev);
                    onItemClick('Technical Integration');
                  }}
                  className={navItemClassName(isTechnicalActive)}
                >
                  <Code className="size-[17px] shrink-0 opacity-85" strokeWidth={2} />
                  <span className="min-w-0 truncate text-left">Technical Integration</span>
                  <ChevronRight
                    className={cn(
                      'ml-auto size-3.5 shrink-0 text-[var(--sidebar-muted)] transition-transform',
                      (technicalExpanded || searchActive) && 'rotate-90',
                    )}
                    strokeWidth={2}
                  />
                </button>
                {technicalExpanded || searchActive ? (
                  <div className="ml-7 mt-0.5 space-y-0.5">
                    {visibleTechnicalItems.map((item) => {
                      const nestedLabel = `Technical Integration - ${item.label}`;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => onItemClick(nestedLabel)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-[9px] px-[11px] py-1.5 text-[12.5px] transition-colors',
                            activeItem === nestedLabel
                              ? 'bg-white/10 font-medium text-white'
                              : 'text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-[var(--sidebar-text)]',
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          {/* DPDPA Consent Managers page temporarily hidden from navigation
          <NavItemButton
            item={{ label: 'DPDPA Consent Managers', icon: Scale }}
            isActive={activeItem === 'DPDPA Consent Managers'}
            collapsed={collapsed}
            onClick={() => onItemClick('DPDPA Consent Managers')}
          />
          */}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Primary application sidebar with workspace switcher, search, and grouped navigation.
 */
export function Sidebar(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { guardedNavigate } = useNavigationGuard();
  const activeItem = getLabelForPath(location.pathname);
  const [width, setWidth] = useState(readStoredSidebarWidth);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { user, logout } = useAuth();
  const { settings } = useWorkspaceSettings();
  const isBankingOrg = settings?.primary_industry === 'Banking & Financial Services';
  const administrationItems = getAdministrationNavItems(user);
  const dataPrincipalRightsItems = getDataPrincipalRightsItems(user);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(SIDEBAR_DEFAULT_WIDTH);
  const widthRef = useRef(width);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shortcutLabel = isMacPlatform() ? '⌘K' : 'Ctrl+K';

  widthRef.current = width;

  const [recordsCount, setRecordsCount] = useState<number | null>(null);
  const [activeScanCount, setActiveScanCount] = useState<number | null>(null);
  const [legitimateUseDueCount, setLegitimateUseDueCount] = useState<number | null>(null);
  const [regulatoryOverdueCount, setRegulatoryOverdueCount] = useState<number | null>(null);
  const dataProtectionItems = getDataProtectionItems(recordsCount, activeScanCount);
  const advancedGovernanceItems = getAdvancedGovernanceItems(
    legitimateUseDueCount,
    regulatoryOverdueCount,
  );
  const searchActive = searchQuery.trim().length > 0;
  const vajraAiVisible = vajraAiMatchesSearch(searchQuery);
  const hasVisibleNav =
    !searchActive ||
    navSectionsHaveResults(searchQuery, [
      { title: 'Overview', items: OVERVIEW_ITEMS },
      { title: 'Vajra Healthcare', items: HEALTHCARE_SHIELD_ITEMS },
      { title: 'Consent Management', items: CONSENT_MANAGEMENT_ITEMS },
      ...(isBankingOrg ? [{ title: 'Advanced Consent Management', items: BANKING_CONSENT_ITEMS }] : []),
      { title: 'Data Protection', items: dataProtectionItems },
      { title: 'Data Principal Rights', items: dataPrincipalRightsItems },
      { title: 'Compliance', items: COMPLIANCE_ITEMS },
      { title: 'Governance', items: GOVERNANCE_ITEMS },
      { title: 'Advanced Governance', items: advancedGovernanceItems },
      { title: 'Settings', items: SETTINGS_ITEMS },
      { title: 'Administration', items: administrationItems },
    ]) ||
    integrationsHasResults(searchQuery) ||
    vajraAiVisible;

  useEffect(() => {
    async function loadSummary() {
      try {
        const summary = await fetchChildSummary(user?.organization_id || undefined);
        setRecordsCount(summary.total_records);
      } catch (err) {
        console.error('Failed to load child records count:', err);
      }
    }
    if (user) {
      void loadSummary();
    }
    const handleUpdate = () => {
      if (user) {
        void loadSummary();
      }
    };
    window.addEventListener('child-records-updated', handleUpdate);
    return () => {
      window.removeEventListener('child-records-updated', handleUpdate);
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadGovernanceBadges() {
      try {
        const orgId = user?.organization_id || undefined;
        const [legitimateSummary, regulatorySummary] = await Promise.all([
          fetchLegitimateUseSummary(orgId),
          fetchRegulatoryProceedingSummary(orgId),
        ]);
        if (!cancelled) {
          setLegitimateUseDueCount(legitimateSummary.due_for_review);
          setRegulatoryOverdueCount(regulatorySummary.overdue_count);
        }
      } catch (err) {
        console.error('Failed to load advanced governance badge counts:', err);
      }
    }
    if (user) {
      void loadGovernanceBadges();
      const interval = window.setInterval(() => void loadGovernanceBadges(), 60000);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }
    return undefined;
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadScanCount() {
      try {
        const summary = await fetchPiiSummary(user?.organization_id || undefined);
        if (!cancelled) setActiveScanCount(summary.running_scans);
      } catch (err) {
        console.error('Failed to load active PII scan count:', err);
      }
    }
    if (user) {
      void loadScanCount();
      const interval = window.setInterval(() => void loadScanCount(), 30000);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }
    return undefined;
  }, [user]);

  const handleItemClick = (label: string): void => {
    const path = getPathForLabel(label);
    if (path) {
      setSearchQuery('');
      void guardedNavigate(path);
    }
  };

  const focusSearch = useCallback((): void => {
    if (isCollapsed) {
      setIsCollapsed(false);
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return;
    }
    searchInputRef.current?.focus();
  }, [isCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch]);

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await logout();
      notify('Logged out.');
    } catch {
      notify('Logged out.');
    } finally {
      navigate('/login', { replace: true });
    }
  }, [logout, navigate]);

  const handleResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStartX.current = event.clientX;
    dragStartWidth.current = widthRef.current;
    setIsResizing(true);
  }, []);

  const handleResizeReset = useCallback(() => {
    const resetWidth = SIDEBAR_DEFAULT_WIDTH;
    setWidth(resetWidth);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(resetWidth));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    window.localStorage.removeItem('dpdpa-sidebar-collapsed');
  }, []);

  const effectiveWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent): void => {
      const delta = event.clientX - dragStartX.current;
      setWidth(clampSidebarWidth(dragStartWidth.current + delta));
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(widthRef.current));
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <div
      className="relative flex h-full shrink-0 transition-[width] duration-200 ease-out"
      style={{ width: effectiveWidth }}
    >
      <aside
        className="flex h-full w-full flex-col text-[var(--sidebar-text)]"
        style={{
          background: 'linear-gradient(180deg, var(--sidebar-gradient-from), var(--sidebar-gradient-to))',
        }}
      >
        <div className={cn('px-4 pt-[22px]', isCollapsed ? 'pb-3' : 'pb-0')}>
          <div
            className={cn(
              'flex items-center gap-2.5',
              isCollapsed ? 'flex-col px-0 pb-3' : 'px-1.5 pb-[18px]',
            )}
          >
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-white/50">
              <Shield className="size-4 text-white" strokeWidth={2} />
            </div>
            {!isCollapsed ? (
              <h1 className="min-w-0 flex-1 text-base font-bold tracking-tight text-white">Vajra</h1>
            ) : null}
            <button
              type="button"
              onClick={toggleCollapsed}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'shrink-0 rounded-lg text-[var(--sidebar-muted)] transition-colors hover:bg-white/10 hover:text-white',
                isCollapsed ? 'p-2' : 'p-1.5',
              )}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="size-[17px]" strokeWidth={2} />
              ) : (
                <PanelLeftClose className="size-4" strokeWidth={2} />
              )}
            </button>
          </div>

          {!isCollapsed ? (
            <button
              type="button"
              className="mb-[18px] flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--sidebar-surface-border)] bg-[var(--sidebar-surface)] px-[11px] py-[9px] transition-colors hover:bg-white/[0.07]"
            >
              <span className="min-w-0 truncate text-[13px] font-medium text-[var(--sidebar-org-name)]">
                Vajra Pvt Ltd
              </span>
              <span className="shrink-0 rounded-md border border-[var(--sidebar-badge-border)] bg-[var(--sidebar-badge-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--sidebar-badge-text)]">
                Enterprise
              </span>
              <ChevronDown className="size-3 shrink-0 text-[var(--sidebar-muted)]" strokeWidth={2} />
            </button>
          ) : null}
        </div>

        {!isCollapsed ? (
          <div className="px-4 pb-2">
            <div className="relative flex items-center gap-2 rounded-[10px] border border-[var(--sidebar-surface-border)] bg-[var(--sidebar-surface)] px-[11px] py-[9px] text-[13px] text-[var(--sidebar-muted)] focus-within:border-white/20 focus-within:bg-white/[0.07]">
              <SearchIcon className="size-[15px] shrink-0" strokeWidth={2} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Search…"
                aria-label="Search sidebar navigation"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--sidebar-text)] outline-none placeholder:text-[var(--sidebar-muted)]"
              />
              <kbd className="shrink-0 rounded-[5px] border border-white/12 px-1.5 py-0.5 text-[10.5px] text-[var(--sidebar-muted)]">
                {shortcutLabel}
              </kbd>
            </div>
          </div>
        ) : (
          <div className="px-3 pb-2">
            <button
              type="button"
              title="Search"
              onClick={focusSearch}
              className="flex w-full items-center justify-center rounded-[9px] p-2 text-[var(--sidebar-muted)] transition-colors hover:bg-white/5 hover:text-white"
            >
              <SearchIcon className="size-[17px]" strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {searchActive && !hasVisibleNav ? (
            <p className="px-2 py-3 text-[12.5px] text-[var(--sidebar-muted)]">No pages found.</p>
          ) : null}

          {(!searchQuery.trim() || 'how to use'.includes(searchQuery.trim().toLowerCase())) && (
            <div className="mb-[18px]">
              <NavItemButton
                item={{ label: 'How to Use', icon: BookOpen, badge: 'Start' }}
                isActive={activeItem === 'How to Use'}
                collapsed={isCollapsed}
                onClick={() => handleItemClick('How to Use')}
                className={cn(
                  activeItem !== 'How to Use' && 'bg-[var(--sidebar-badge-bg)] text-[#e7e6f2] font-semibold border border-[var(--sidebar-badge-border)] hover:bg-[#6f5ff0]/20'
                )}
              />
            </div>
          )}

          <CollapsibleNavSection
            title="Overview"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={OVERVIEW_ITEMS}
            defaultOpen
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Vajra Healthcare"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={HEALTHCARE_SHIELD_ITEMS}
            defaultOpen
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Consent Management"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={CONSENT_MANAGEMENT_ITEMS}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          {isBankingOrg ? (
            <CollapsibleNavSection
              title="Advanced Consent Management"
              activeItem={activeItem}
              onItemClick={handleItemClick}
              items={BANKING_CONSENT_ITEMS}
              collapsed={isCollapsed}
              searchQuery={searchQuery}
            />
          ) : null}

          <IntegrationsNavSection
            activeItem={activeItem}
            onItemClick={handleItemClick}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Data Protection"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={dataProtectionItems}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Data Principal Rights"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={dataPrincipalRightsItems}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Compliance"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={COMPLIANCE_ITEMS}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Governance"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={GOVERNANCE_ITEMS}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Advanced Governance"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={advancedGovernanceItems}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          <CollapsibleNavSection
            title="Settings"
            activeItem={activeItem}
            onItemClick={handleItemClick}
            items={SETTINGS_ITEMS}
            collapsed={isCollapsed}
            searchQuery={searchQuery}
          />

          {administrationItems.length > 0 ? (
            <CollapsibleNavSection
              title="Administration"
              activeItem={activeItem}
              onItemClick={handleItemClick}
              items={administrationItems}
              collapsed={isCollapsed}
              searchQuery={searchQuery}
            />
          ) : null}
        </div>

        <div className={cn('mt-1.5 space-y-3.5 border-t border-white/[0.07] p-4', isCollapsed && 'px-3')}>
          {vajraAiVisible ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                void guardedNavigate('/ai/copilot');
              }}
            title={isCollapsed ? 'Vajra AI' : undefined}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-[11px] bg-gradient-to-br from-[var(--sidebar-primary-2)] to-[#5a4fe6] text-[13.5px] font-semibold text-white shadow-[var(--sidebar-ai-glow)] transition-opacity hover:opacity-95',
              isCollapsed ? 'p-2.5' : 'px-4 py-[11px]',
            )}
          >
            <Sparkles className="size-4 shrink-0" strokeWidth={2} />
            {!isCollapsed ? 'Vajra AI' : null}
          </button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={isCollapsed && user ? displayName(user) : undefined}
                className={cn(
                  'flex w-full items-center gap-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-white/20',
                  isCollapsed ? 'justify-center px-0 py-1' : 'rounded-[9px] px-2 py-[9px] hover:bg-white/5',
                )}
              >
                <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#6f5ff0] to-[#8b5cf6] text-[12.5px] font-bold text-white">
                  {user ? userInitials(user.full_name) : <User className="size-4" strokeWidth={2} />}
                </div>
                {!isCollapsed ? (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[13px] font-semibold leading-tight text-white">
                        {user ? displayName(user) : 'Guest'}
                      </div>
                      <div className="text-[11.5px] text-[var(--sidebar-muted)]">
                        {user ? roleLabel(user.role) : 'Not signed in'}
                      </div>
                    </div>
                    <ChevronDown className="size-4 shrink-0 text-[var(--sidebar-muted)]" strokeWidth={2} />
                  </>
                ) : null}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" side="top" className="min-w-56">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => void handleLogout()}
                className="cursor-pointer"
                variant="destructive"
              >
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {!isCollapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResizeReset}
          className={cn(
            'absolute top-0 right-0 z-10 h-full w-1.5 -mr-0.5 cursor-col-resize touch-none',
            'hover:bg-white/15 active:bg-white/25',
            isResizing && 'bg-white/25',
          )}
        />
      ) : null}
    </div>
  );
}
