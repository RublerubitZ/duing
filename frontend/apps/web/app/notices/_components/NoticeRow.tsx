type NoticeRowItem = {
  pinned?: boolean;
  tag: string;
  title: string;
  date: string;
};

type Props = {
  notice: NoticeRowItem;
};

export function NoticeRow({ notice }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 18,
      padding: '16px 4px',
      borderBottom: '1px solid var(--gray-line)',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 56, textAlign: 'center',
        fontSize: 11, fontWeight: 700,
        color: notice.pinned ? 'var(--ink)' : 'var(--charcoal-3)',
        letterSpacing: '0.04em',
      }}>
        {notice.pinned ? '📌' : ''} {notice.tag}
      </div>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--charcoal)' }}>
        {notice.title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--charcoal-3)', fontVariantNumeric: 'tabular-nums' }}>
        {notice.date}
      </div>
    </div>
  );
}
