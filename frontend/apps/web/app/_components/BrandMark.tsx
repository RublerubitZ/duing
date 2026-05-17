import { Sparkle } from './Sparkle';

type Props = {
  size?: number;
  light?: boolean;
};

export function BrandMark({ size = 26, light = false }: Props) {
  return (
    <span className="brand-mark" style={{ fontSize: size }}>
      <span className="b-d" style={light ? { color: '#fff' } : undefined}>D</span>
      <span className="b-u">u</span>
      <span className="b-ing" style={light ? { color: 'rgba(255,255,255,0.92)' } : undefined}>ing</span>
      <span className="b-spark">
        <Sparkle size={size * 0.6} color="#9DB6A0" />
      </span>
    </span>
  );
}
