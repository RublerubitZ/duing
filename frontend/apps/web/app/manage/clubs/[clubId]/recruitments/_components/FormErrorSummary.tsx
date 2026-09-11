'use client';

type Props = { errors: { fieldId: string; message: string }[] };

/** 폼 상단 오류 요약 — 항목을 누르면 해당 필드로 포커스. */
export function FormErrorSummary({ errors }: Props) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-[13px] border border-danger/40 bg-danger/5 px-4 py-3">
      <p className="text-sm font-bold text-danger">{errors.length}곳을 확인해 주세요</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-charcoal-2">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                const el = document.getElementById(error.fieldId);
                // jsdom 에는 scrollIntoView 가 없어 있을 때만 부른다(AdminClubJoinCodesTable 전례).
                el?.scrollIntoView?.({ block: 'center' });
                el?.focus();
              }}
            >
              {error.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
