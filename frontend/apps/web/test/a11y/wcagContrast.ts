/** WCAG 2.x 상대 휘도·대비 계산 — 색 대비 회귀 테스트 공용. 색은 모두 `#rrggbb`. */

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
