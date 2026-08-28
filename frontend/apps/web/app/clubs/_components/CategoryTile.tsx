import { CAT_COLORS, type ClubCat } from '../_lib/clubs';

type Props = {
  cat: ClubCat;
  count: number;
  big?: boolean;
};

export function CategoryTile({ cat, count, big = false }: Props) {
  const c = CAT_COLORS[cat];
  return (
    <div style={{
      padding: big ? '28px 24px' : '22px 20px',
      borderRadius: 20,
      background: c.bgValue,
      border: `1px solid ${c.bgValue}`,
      cursor: 'pointer',
      position: 'relative',
      minHeight: big ? 160 : 130,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: big ? 13 : 11.5,
        fontWeight: 500,
        color: c.fgValue, opacity: 0.65,
        letterSpacing: '0.04em',
      }}>{c.num} / 09</div>
      <div style={{
        position: 'absolute', top: big ? 22 : 18, right: big ? 22 : 18,
        fontSize: big ? 38 : 32,
      }}>{c.emoji}</div>
      <div>
        <div style={{
          fontSize: big ? 28 : 22,
          fontWeight: 700,
          color: c.fgValue,
          marginBottom: 4,
        }}>{cat}</div>
        <div style={{ fontSize: 13, color: c.fgValue, opacity: 0.7 }}>
          {count}개 동아리
        </div>
      </div>
    </div>
  );
}
