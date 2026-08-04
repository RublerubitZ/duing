/**
 * 외부 폼 모집의 회원 등록 절차 카드 (스펙 §7). 작성 화면(§1.2)·전환 다이얼로그(§1.1)·모집 관리 화면(§5)이
 * 같은 플로우를 보여줘야 하므로 한 컴포넌트에 둔다. 제목은 쓰는 쪽(SectionCard·다이얼로그)이 갖는다.
 */
// 순서는 발급 정책(§4.2 — 모집 진행 중에만 생성)에 맞춘 것이다: 링크는 모집 종료 "전" 에 만들어
// 공유하고, 모집 종료는 회원 등록이 끝난 뒤에 온다.
export const MEMBER_ENROLLMENT_STEPS = [
  '외부 모집 진행',
  '합격자 선정',
  '가입 링크 생성·공유',
  '학생 가입 요청',
  '운영진 승인',
  '회원 등록',
  '모집 종료',
] as const;

export function MemberEnrollmentStepsCard() {
  return (
    <div className="rounded-[13px] border border-line bg-cream p-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {MEMBER_ENROLLMENT_STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-xs text-charcoal-3">
                →
              </span>
            )}
            <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-charcoal-2">
              {step}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-charcoal-3">
        외부 폼으로 받은 지원자 중 합격자에게 가입 링크를 공유하면, 학생이 가입을 요청하고 운영진이 승인해
        회원으로 등록돼요. 가입 링크는 모집이 진행 중일 때 모집 관리 화면에서 만들 수 있어요.
      </p>
    </div>
  );
}
