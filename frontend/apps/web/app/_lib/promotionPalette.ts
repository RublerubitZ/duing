import type { PromotionPalette } from '@duing/types';

export type PromotionPaletteStyle = {
  /** 배경 (linear-gradient 또는 solid). */
  bg: string;
  /** 본문 텍스트 색. */
  fg: string;
  /** 태그 / CTA / 데코 색. */
  accent: string;
};

/**
 * 어드민이 선택할 수 있는 6 종 프리셋 팔레트 → 실제 hex 매핑.
 * 백엔드는 코드만 저장하고, 시각 표현은 이 테이블 한 곳에서 관리한다.
 */
export const PROMOTION_PALETTE: Record<PromotionPalette, PromotionPaletteStyle> = {
  INK: {
    bg: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)',
    fg: '#fff',
    accent: '#9DB6A0',
  },
  PLAIN: {
    bg: '#FAF7F0',
    fg: '#143025',
    accent: '#1F4A36',
  },
  SAGE: {
    bg: 'linear-gradient(120deg, #E8EEE8 0%, #C9D8CC 100%)',
    fg: '#143025',
    accent: '#1F4A36',
  },
  WARM: {
    bg: 'linear-gradient(120deg, #FBEFD7 0%, #F3DEAA 100%)',
    fg: '#5C3F11',
    accent: '#8E6620',
  },
  CORAL: {
    bg: 'linear-gradient(120deg, #FCE2D9 0%, #F4C0AE 100%)',
    fg: '#6A2611',
    accent: '#9A3F23',
  },
  BERRY: {
    bg: 'linear-gradient(120deg, #F2DDE3 0%, #E4B0BF 100%)',
    fg: '#5A1C30',
    accent: '#B65672',
  },
  SKY: {
    bg: 'linear-gradient(120deg, #DCE7F3 0%, #B7CCE4 100%)',
    fg: '#1B345A',
    accent: '#3B6FAA',
  },
};

export const PALETTE_OPTIONS: { value: PromotionPalette; label: string }[] = [
  { value: 'INK', label: '잉크 (다크 세이지)' },
  { value: 'PLAIN', label: '플레인 (베이지)' },
  { value: 'SAGE', label: '세이지 (라이트 그린)' },
  { value: 'WARM', label: '웜 (옐로우)' },
  { value: 'CORAL', label: '코랄 (피치)' },
  { value: 'BERRY', label: '베리 (핑크)' },
  { value: 'SKY', label: '스카이 (블루)' },
];
