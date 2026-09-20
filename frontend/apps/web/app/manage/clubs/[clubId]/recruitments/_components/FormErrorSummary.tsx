'use client';

type Props = { errors: { fieldId: string; label: string; message: string }[] };

/**
 * 폼 상단 오류 요약 — 항목을 누르면 해당 필드로 포커스.
 * 문구만 나열하면 시작일·종료일처럼 메시지가 같은 필드를 구분할 수 없어 필드 라벨을 앞에 붙인다.
 */
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
              {/* 한 문자열로 넘긴다 — 자식 노드로 쪼개면 접근명에서 구분자 공백이 사라질 수 있다. */}
              {`${error.label} · ${error.message}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
