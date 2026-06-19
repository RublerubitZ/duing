/** 지원서 작성 — 자동 임시저장이 강조된 단계형 폼 미리보기. */
export function ApplyMockup() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <h4 className="mb-1.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-charcoal-3">
        STEP 2 / 3 · 자기소개
      </h4>
      <p className="mb-3.5 text-[16px] font-bold text-ink-deep">지원 동기를 적어주세요</p>
      <div className="min-h-[120px] rounded-md border border-line bg-cream p-3 text-[13px] leading-[1.6] text-charcoal-2">
        대학 와서 처음으로 개발 공부를 시작했고, 혼자 강의를 들으면서 자그마한 사이드 프로젝트를…
        <span
          className="animate-blink-cursor ml-0.5 inline-block h-[14px] w-px align-[-2px]"
          style={{ background: 'var(--ink)' }}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-sage" />
        자동 저장됨 · 방금 전
      </div>
      <div className="mt-3.5 flex items-center justify-between">
        <span className="text-[12.5px] text-charcoal-3">← 이전</span>
        <span className="btn btn-primary btn-sm rounded-md">다음 단계</span>
      </div>
    </div>
  );
}
