export type NotificationCategory =
  | 'system'
  | 'dsar'
  | 'breach'
  | 'consent'
  | 'ropa'
  | 'approval';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface UserNotification {
  id: string;
  organization_id: string;
  recipient_id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  action_url: string | null;
  severity: NotificationSeverity;
  is_read: boolean;
  created_at: string;
}

export interface NotificationUnreadCount {
  unread_count: number;
}
