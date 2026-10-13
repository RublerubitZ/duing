/** WCAG 2.x 상대 휘도·대비 계산 — 색 대비 회귀 테스트 공용. 색은 모두 `#rrggbb`. */

import tailwindConfig from '../../tailwind.config';

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function parseHexColor(hex: string): [number, number, number] {
  if (!HEX_COLOR_PATTERN.test(hex)) throw new Error(`#rrggbb 형식이 아니다: ${hex}`);
  const channelAt = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return [channelAt(1), channelAt(3), channelAt(5)];
}

function toHexColor(channels: [number, number, number]): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function linearize(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHexColor(hex);
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

/** 투명도 alpha(0~1)인 색을 불투명한 바탕 위에 합성한 색 — 브라우저처럼 채널을 정수로 반올림한다. */
export function blendOver(hex: string, alpha: number, surfaceHex: string): string {
  const [red, green, blue] = parseHexColor(hex);
  const [surfaceRed, surfaceGreen, surfaceBlue] = parseHexColor(surfaceHex);
  const mix = (channel: number, surfaceChannel: number) =>
    Math.round(channel * alpha + surfaceChannel * (1 - alpha));
  return toHexColor([mix(red, surfaceRed), mix(green, surfaceGreen), mix(blue, surfaceBlue)]);
}

const COLOR_CLASS_PATTERN = /^(?:bg|text)-([a-z0-9-]+)(?:\/(\d+))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * `bg-pastel-mint-accent/10` → 토큰 경로 `pastel-mint-accent`, 투명도 0.1. 접미사가 없으면 불투명.
 * 브라우저는 /10 을 8비트(26/255≈0.102)로 내보내 대비가 최대 0.03 낮아질 수 있다 — 사용처는 기준과의 여유를 함께 본다.
 */
export function parseColorClass(colorClass: string): { tokenPath: string; alpha: number } {
  const match = COLOR_CLASS_PATTERN.exec(colorClass);
  const tokenPath = match?.[1];
  if (!tokenPath) throw new Error(`색 클래스로 해석할 수 없다: ${colorClass}`);
  const opacityPercent = match?.[2];
  return { tokenPath, alpha: opacityPercent === undefined ? 1 : Number(opacityPercent) / 100 };
}

/** 토큰 경로를 `-` 로 나눠 theme.extend.colors 를 내려간다. 끝에서 객체면 DEFAULT(`sky` → sky.DEFAULT). */
export function resolveTokenHex(tokenPath: string): string {
  let colorNode: unknown = tailwindConfig.theme?.extend?.colors;
  for (const segment of tokenPath.split('-')) {
    colorNode = isRecord(colorNode) ? colorNode[segment] : undefined;
  }
  if (isRecord(colorNode)) colorNode = colorNode.DEFAULT;
  if (typeof colorNode !== 'string' || !HEX_COLOR_PATTERN.test(colorNode)) {
    throw new Error(`색 토큰 ${tokenPath} 을 #rrggbb 로 해석할 수 없다: ${String(colorNode)}`);
  }
  return colorNode;
}
