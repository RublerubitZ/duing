export type NotificationType =
  | 'RECRUITMENT_OPENED'
  | 'RECRUITMENT_DEADLINE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_REMINDER';

export type Notification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};
