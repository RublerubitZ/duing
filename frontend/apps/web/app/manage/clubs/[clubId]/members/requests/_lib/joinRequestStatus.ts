import type { JoinRequestStatus } from '@duing/types';

const STATUS_LABEL: Record<JoinRequestStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '거절',
};

export const JOIN_REQUEST_STATUSES: JoinRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export function joinRequestStatusLabel(status: JoinRequestStatus): string {
  return STATUS_LABEL[status];
}

export function joinRequestEmptyMessage(status: JoinRequestStatus): string {
  return status === 'PENDING'
    ? '대기 중인 가입 요청이 없어요'
    : `${STATUS_LABEL[status]}된 가입 요청이 없어요`;
}
