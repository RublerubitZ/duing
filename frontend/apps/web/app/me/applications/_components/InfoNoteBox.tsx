/* a-apply-status-parts.jsx → TypeScript 변환: InfoNoteBox */

export function InfoNoteBox() {
  return (
    <div style={{
      background: 'var(--gray-soft)',
      border: '1px solid var(--gray-line)',
      borderRadius: 12,
      padding: '14px 18px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 700, color: 'var(--ink-deep)',
        marginBottom: 6,
        whiteSpace: 'nowrap',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M12 11v5" />
        </svg>
        알아두세요!
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
        fontSize: 11.5, color: 'var(--charcoal-2)', lineHeight: 1.55,
      }}>
        <li>· 각 단계별 결과는 동아리의 내부 일정에 따라 상이할 수 있습니다.</li>
        <li>· 면접 일정은 변경될 수 있으며, 알림을 꼭 확인해주세요.</li>
        <li>· 궁금한 점이 있다면 해당 동아리 담당자에게 문의해주세요.</li>
      </ul>
    </div>
  );
}
