import Image from 'next/image';

type Props = {
  size?: number;
  light?: boolean;
};

export function BrandMark({ size = 26, light = false }: Props) {
  // size 는 height 기준. 로고는 가로형이므로 너비는 비율 유지 (Image 의 height/width 비율 보존).
  return (
    <span
      className="brand-mark inline-flex items-center"
      style={{ height: size, filter: light ? 'brightness(0) invert(1)' : undefined }}
    >
      <Image
        src="/duing-logo.png"
        alt="Duing"
        height={size}
        width={Math.round(size * 3.2)}
        priority
        style={{ height: size, width: 'auto' }}
      />
    </span>
  );
}
