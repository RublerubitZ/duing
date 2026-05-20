export type NotificationType =
  | 'RECRUITMENT_OPENED'
  | 'RECRUITMENT_DEADLINE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_REMINDER'
  | 'NOTICE_TARGETED';

export type NotificationSource = 'PERSONAL' | 'BROADCAST';

export type Notification = {
  source: NotificationSource;
  id: number;
  type: NotificationType | null;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};
