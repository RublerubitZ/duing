import type { NoticeCategory } from '@duing/types';

export type CategoryTagStyle = { bg: string; fg: string };

export const CATEGORY_TAG_STYLES: Record<NoticeCategory, CategoryTagStyle> = {
  FESTIVAL: { bg: '#FCE2D9', fg: '#9A3F23' },
  FAIR: { bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  FUNDING: { bg: '#DDE8F1', fg: '#2F557A' },
  CONTEST: { bg: '#FBEFD7', fg: '#8E6620' },
  GENERAL: { bg: 'var(--gray-soft)', fg: 'var(--charcoal-2)' },
};

/** 백엔드가 먼저 배포한 새 분류 값이 서버 렌더(ISR)를 깨지 않게 모르는 값은 일반 스타일로 본다. */
export function categoryTagStyleOf(category: NoticeCategory): CategoryTagStyle {
  return CATEGORY_TAG_STYLES[category] ?? CATEGORY_TAG_STYLES.GENERAL;
}
