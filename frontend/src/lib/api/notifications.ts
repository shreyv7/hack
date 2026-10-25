import { apiFetch } from '@/lib/api/client';
import type { NotificationUnreadCount, UserNotification } from '@/types/notifications';

export function fetchNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<UserNotification[]> {
  const params = new URLSearchParams();
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }
  if (options?.unreadOnly) {
    params.set('unread_only', 'true');
  }
  const query = params.toString();
  return apiFetch<UserNotification[]>(`/users/me/notifications${query ? `?${query}` : ''}`);
}

export function fetchUnreadNotificationCount(): Promise<NotificationUnreadCount> {
  return apiFetch<NotificationUnreadCount>('/users/me/notifications/unread-count');
}

export function markNotificationRead(notificationId: string): Promise<UserNotification> {
  return apiFetch<UserNotification>(`/users/me/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsRead(): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>('/users/me/notifications/read-all', {
    method: 'POST',
  });
}
