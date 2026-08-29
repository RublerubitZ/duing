import Image from 'next/image';

type Props = {
  size?: number;
  light?: boolean;
};

export function BrandMark({ size = 26, light = false }: Props) {
  // size 는 height 기준. width/height 속성은 SVG viewBox(60×21) 그대로 두고 표시 크기는
  // CSS(height 고정 + width auto)로만 지정한다 — 근사 비율로 속성을 계산하면 렌더 폭과
  // 1px 어긋나 Next Image 의 "width or height modified" 경고가 뜬다.
  // `.svg` 는 next/image 가 자동으로 unoptimized 처리하므로 원본을 그대로 내려준다.
  return (
    <span
      className="brand-mark inline-flex items-center"
      style={{ height: size, filter: light ? 'brightness(0) invert(1)' : undefined }}
    >
      <Image
        src="/duing-logo.svg"
        alt="Duing"
        width={60}
        height={21}
        priority
        style={{ height: size, width: 'auto', display: 'block' }}
      />
    </span>
  );
}
