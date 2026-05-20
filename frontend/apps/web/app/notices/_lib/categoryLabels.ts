import type { NoticeCategory } from '@duing/types';

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  FESTIVAL: '축제',
  FAIR: '박람회',
  FUNDING: '지원사업',
  CONTEST: '공모전',
  GENERAL: '일반',
};

export const NOTICE_CATEGORY_OPTIONS: { value: NoticeCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'FESTIVAL', label: '축제' },
  { value: 'FAIR', label: '박람회' },
  { value: 'FUNDING', label: '지원사업' },
  { value: 'CONTEST', label: '공모전' },
  { value: 'GENERAL', label: '일반' },
];
