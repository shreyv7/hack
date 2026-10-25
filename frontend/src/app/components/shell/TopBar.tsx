import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  FileCheck,
  FileText,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { getBreadcrumbs } from '@/router/pathMap';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationCategory, UserNotification } from '@/types/notifications';

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function categoryIcon(category: NotificationCategory): ReactElement {
  switch (category) {
    case 'breach':
      return <ShieldAlert className="size-4 shrink-0 text-[var(--status-danger)]" strokeWidth={1.5} />;
    case 'dsar':
      return <FileText className="size-4 shrink-0 text-[var(--status-info)]" strokeWidth={1.5} />;
    case 'approval':
      return <FileCheck className="size-4 shrink-0 text-[var(--status-warning)]" strokeWidth={1.5} />;
    case 'ropa':
      return <FileText className="size-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={1.5} />;
    default:
      return <Bell className="size-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={1.5} />;
  }
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: UserNotification;
  onOpen: (notification: UserNotification) => void;
}): ReactElement {
  const isCritical = notification.severity === 'critical';
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`w-full text-left px-2 py-2.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
        notification.is_read ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {isCritical ? (
          <AlertTriangle className="size-4 shrink-0 text-[var(--status-danger)] mt-0.5" strokeWidth={1.5} />
        ) : (
          categoryIcon(notification.category)
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm truncate ${
                notification.is_read
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-primary)] font-medium'
              }`}
            >
              {notification.title}
            </span>
            {!notification.is_read && (
              <span className="size-1.5 rounded-full bg-[var(--status-info)] shrink-0" aria-hidden />
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            {formatRelativeTime(notification.created_at)}
          </p>
        </div>
      </div>
    </button>
  );
}

/**
 * Top application bar with breadcrumb trail, environment badge, and utility actions.
 */
export function TopBar(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleDarkMode = (): void => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    if (nextIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleOpenNotification = async (notification: UserNotification): Promise<void> => {
    if (!notification.is_read) {
      try {
        await markRead(notification.id);
      } catch {
        // Navigation still proceeds if mark-read fails.
      }
    }
    setMenuOpen(false);
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    if (unreadCount === 0) return;
    try {
      await markAllRead();
    } catch {
      // Silent failure; user can retry.
    }
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b shrink-0 bg-card border-[var(--border-default)]">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-secondary)]">Workspace</span>
        <ChevronRight className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <div key={`${crumb}-${index}`} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="size-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />}
              <span className={isLast ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}>
                {crumb}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--status-success-bg)] text-[var(--status-success)]">
          <span className="size-1.5 rounded-full bg-[var(--status-success)]" />
          Live
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              title="Notifications"
              className="relative p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Bell className="size-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--status-danger)] text-white text-[10px] font-semibold flex items-center justify-center"
                  aria-hidden
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="flex items-center gap-1 text-xs text-[var(--status-info)] hover:underline"
                >
                  <CheckCheck className="size-3.5" strokeWidth={1.5} />
                  Mark all read
                </button>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto px-1 py-1">
              {loading ? (
                <p className="px-2 py-4 text-sm text-[var(--text-secondary)] text-center">
                  Loading…
                </p>
              ) : notifications.length > 0 ? (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={(item) => void handleOpenNotification(item)}
                  />
                ))
              ) : (
                <p className="px-2 py-4 text-sm text-[var(--text-secondary)] text-center">
                  No notifications
                </p>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-black/5 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Moon className="size-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
          ) : (
            <Sun className="size-5 text-[var(--text-secondary)]" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </header>
  );
}
