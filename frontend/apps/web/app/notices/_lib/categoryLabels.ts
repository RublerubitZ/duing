import type { NoticeCategory } from '@duing/types';

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  FESTIVAL: '축제',
  FAIR: '박람회',
  FUNDING: '지원사업',
  CONTEST: '공모전',
  GENERAL: '일반',
};

/** 백엔드가 먼저 배포한 새 분류 값이면 빈칸 대신 '일반'(#1410 스타일 폴백과 같은 값). */
export function noticeCategoryLabelOf(category: NoticeCategory): string {
  return NOTICE_CATEGORY_LABEL[category] ?? NOTICE_CATEGORY_LABEL.GENERAL;
}

export const NOTICE_CATEGORY_OPTIONS: { value: NoticeCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'FESTIVAL', label: '축제' },
  { value: 'FAIR', label: '박람회' },
  { value: 'FUNDING', label: '지원사업' },
  { value: 'CONTEST', label: '공모전' },
  { value: 'GENERAL', label: '일반' },
];
