// 백엔드 `NotificationType` enum 과 같은 목록 — 백엔드에 종류를 추가하면 여기와 `NotificationItem` 의 `TYPE_VISUALS` 를 함께 갱신.
export type NotificationType =
  | 'RECRUITMENT_OPENED'
  | 'RECRUITMENT_DEADLINE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_UPDATED'
  | 'INTERVIEW_CANCELLED'
  | 'INTERVIEW_AVAILABILITY_REQUESTED'
  | 'INTERVIEW_REMINDER'
  | 'NOTICE_TARGETED'
  | 'FEE_PAID_CONFIRMED'
  | 'FEE_PARTIAL_PAYMENT_CONFIRMED'
  | 'FEE_BILL_OVERDUE'
  | 'FEE_BILL_ISSUED'
  | 'FEE_BILL_DUE_SOON'
  | 'FEDERATION_INQUIRY_RECEIVED'
  | 'FEDERATION_INQUIRY_ANSWERED'
  | 'FEDERATION_INQUIRY_CLOSED'
  | 'FACILITY_BOOKING_SUBMITTED'
  | 'FACILITY_BOOKING_APPROVED'
  | 'FACILITY_BOOKING_REJECTED'
  | 'FACILITY_BOOKING_CONFIRMED'
  | 'FACILITY_BOOKING_CONFLICT'
  | 'FACILITY_BOOKING_CANCELLED'
  | 'APPLICATION_RECEIVED'
  | 'APPLICATION_PENDING_REMINDER'
  | 'EXTERNAL_RECRUITMENT_STILL_OPEN';

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
