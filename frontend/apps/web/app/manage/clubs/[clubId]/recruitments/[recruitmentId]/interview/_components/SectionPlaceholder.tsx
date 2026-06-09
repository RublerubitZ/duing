// 비활성(아직 진입 불가) 면접 단계의 placeholder.
// 사용자는 4 단계 흐름을 시각적으로 보되, 진입할 수 없는 단계는 회색 톤으로 표시한다.
type Props = {
  stepNumber: number;
  title: string;
  reason: string;
};

export function SectionPlaceholder({ stepNumber, title, reason }: Props) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h2 className="text-base font-semibold text-slate-400">
        Step {stepNumber} · {title}
      </h2>
      <p className="mt-2 text-sm text-slate-400">{reason}</p>
    </section>
  );
}
