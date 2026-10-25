import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications';
import type { UserNotification } from '@/types/notifications';
import { useAuth } from '@/contexts/AuthContext';

const POLL_INTERVAL_MS = 60_000;

function sortByNewest(items: UserNotification[]): UserNotification[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!user || user.role === 'superadmin') {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    try {
      const [items, count] = await Promise.all([
        fetchNotifications({ limit: 30 }),
        fetchUnreadNotificationCount(),
      ]);
      if (!mountedRef.current) return;
      setNotifications(sortByNewest(items));
      setUnreadCount(count.unread_count);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [reload]);

  const markRead = useCallback(async (notificationId: string) => {
    const updated = await markNotificationRead(notificationId);
    setNotifications((prev) =>
      sortByNewest(
        prev.map((item) => (item.id === notificationId ? updated : item)),
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    return updated;
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    reload,
    markRead,
    markAllRead,
  };
}
