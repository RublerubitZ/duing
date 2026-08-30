import Image from 'next/image';

type BrandMarkProps = {
  size?: number;
  light?: boolean;
  /**
   * 브레이크포인트별 높이가 필요할 때(상단바: 32 → 2xl 40) 넘기는 높이 클래스(`h-8 2xl:h-10`).
   * 있으면 인라인 height 대신 이 클래스가 span 과 img 양쪽에 붙는다 — 인라인 스타일은 미디어 쿼리로 못 바꾼다.
   */
  sizeClassName?: string;
};

export function BrandMark({ size = 26, light = false, sizeClassName }: BrandMarkProps) {
  // size 는 height 기준. width/height 속성은 SVG viewBox(60×21) 그대로 두고 표시 크기는
  // CSS(height 고정 + width auto)로만 지정한다 — 근사 비율로 속성을 계산하면 렌더 폭과
  // 1px 어긋나 Next Image 의 "width or height modified" 경고가 뜬다.
  // `.svg` 는 next/image 가 자동으로 unoptimized 처리하므로 원본을 그대로 내려준다.
  const inlineHeight = sizeClassName ? undefined : size;
  return (
    <span
      className={`brand-mark inline-flex items-center ${sizeClassName ?? ''}`}
      style={{ height: inlineHeight, filter: light ? 'brightness(0) invert(1)' : undefined }}
    >
      <Image
        src="/duing-logo.svg"
        alt="Duing"
        width={60}
        height={21}
        priority
        className={sizeClassName ? `${sizeClassName} w-auto` : undefined}
        style={{ height: inlineHeight, width: 'auto', display: 'block' }}
      />
    </span>
  );
}
