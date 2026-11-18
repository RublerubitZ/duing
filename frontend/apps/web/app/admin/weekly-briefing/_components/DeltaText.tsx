import type { Delta } from '../_lib/weeklyBriefingPresentation';

/** 숫자 옆 작은 회색 증감 — 좁은 폭에서는 숫자 아래 줄, 넓으면 옆. 화면 글자는 숨기고 문장을 스크린리더에 준다. */
export function DeltaText({ delta }: { delta: Delta }) {
  return (
    <>
      <span aria-hidden className="block text-[11px] font-normal text-charcoal-3 sm:ml-1 sm:inline">
        {delta.visible}
      </span>
      <span className="sr-only">{delta.spoken}</span>
    </>
  );
}
