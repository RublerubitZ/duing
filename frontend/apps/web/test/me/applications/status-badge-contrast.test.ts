import { describe, expect, it } from 'vitest';

import { STATUS_META } from '@/app/me/applications/_constants/data';

// 내 지원 목록 상태 알약(StatusBadge, 12px·굵게)은 큰 글씨가 아니라 WCAG AA 4.5:1 을 넘어야 한다.

const linearChannel = (hexColor: string, offset: number): number => {
  const channel = parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hexColor: string): number =>
  0.2126 * linearChannel(hexColor, 1) + 0.7152 * linearChannel(hexColor, 3) + 0.0722 * linearChannel(hexColor, 5);

const contrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

describe('STATUS_META — 알약 글자 대비', () => {
  it.each(Object.entries(STATUS_META))('%s 알약의 글자·바탕 대비가 AA(4.5:1) 이상이다', (_status, meta) => {
    expect(contrastRatio(meta.textColor, meta.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
