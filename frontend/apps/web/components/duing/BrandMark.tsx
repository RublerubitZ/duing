import Image from 'next/image';

type BrandMarkProps = {
  size?: number;
  light?: boolean;
};

export function BrandMark({ size = 26, light = false }: BrandMarkProps) {
  return (
    <span
      className="brand-mark inline-flex items-center"
      style={{ height: size, filter: light ? 'brightness(0) invert(1)' : undefined }}
    >
      <Image
        src="/duing-logo.webp"
        alt="Duing"
        height={size}
        width={Math.round(size * 2.18)}
        priority
        style={{ height: size, width: 'auto', display: 'block' }}
      />
    </span>
  );
}
