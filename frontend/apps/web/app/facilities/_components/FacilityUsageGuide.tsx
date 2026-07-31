'use client';

// 시설물 이용 안내 — 학교 이용 수칙·주의 문구를 접이식으로 제공한다.
// 네이티브 <details>/<summary> 로 키보드 조작·펼침 상태 알림을 브라우저에 위임하고,
// 접힌 상태에서도 눈에 띄도록 위에 한 줄 힌트를 상시 노출한다.

const FACILITY_LIST = [
  '세미나실(커뮤니티룸(1)(1503호), 커뮤니티룸(2)(1527호), 커뮤니티룸(3)(1425호))',
  '공동연습실(공동연습실(1)(2105), 공동연습실(2)(2107), 공동연습실(3)(2109호), 공동연습실(4)(1506호)',
  '웅지관 강당',
] as const;

const COMPLIANCE_RULES = [
  '가. 시설물 내에서 담배를 피우지 말 것',
  '나. 시설물 내에서 청결, 정숙 및 질서를 유지할 것',
  '다. 시설물을 훼손하지 말 것',
  '라. 기타 사용시설물의 해당 부서장이 요구하는 준수사항',
  '마. 음식물 반입 금지',
] as const;

export function FacilityUsageGuide() {
  return (
    <div>
      <p className="mb-2 text-[13px] text-charcoal-2">
        시설물 이용 전 아래 이용 수칙과 신청 규정을 확인하세요.
      </p>

      <details className="group rounded-[18px] border border-line bg-paper">
        {/* summary 콘텐츠 모델(heading 1개) 준수 — 화살표 svg 는 h2 안에 둔다. */}
        <summary className="cursor-pointer list-none rounded-[18px] px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <h2 className="flex items-center justify-between gap-3 text-[15px] font-bold text-ink">
            학생회관 시설물 이용 안내
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-4 w-4 shrink-0 text-charcoal-2 motion-safe:transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3.5 6l4.5 4.5L12.5 6" />
            </svg>
          </h2>
        </summary>

        <div className="px-4 pb-6 pt-4 text-[13.5px] leading-[1.7] text-charcoal-2 sm:px-5">
          <p>
            대구대학교 학생회관(웅지관, 진로취업관)의 동아리 공용시설(세미나실, 공동연습실,
            강당)은 동아리 및 학생자치기구를 위한 시설입니다.
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {FACILITY_LIST.map((facilityName) => (
              <li key={facilityName}>{facilityName}</li>
            ))}
          </ul>

          <h3 className="mt-5 text-[14px] font-bold text-ink">이용 준수 사항</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {COMPLIANCE_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>

          <h3 className="mt-5 text-[14px] font-bold text-ink">사용 신청</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>이용 시간: 평일 9:00 ~ 21:30</li>
            <li>신청 대상: 중앙동아리, 중앙자치기구, 수업 관련 부서</li>
            <li>사용 신청은 시설물 사용 7일전부터 사용 전날 12:00까지 가능</li>
            <li>
              하루 최대 3시간, 일주일에 연속하여 3일 이상 동일한 공간을 예약할 수 없음 (단, 학교
              대표로 출전하는 각종 행사나 교내 행사에 필요하다고 판단될 시 학생지원부의 승인을
              얻어 예외로 할 수 있다.)
            </li>
            <li>사용 신청은 동아리명(자치기구명)으로 신청하면 되며 참석자 명단을 반드시 첨부하여야 함</li>
            <li>
              이용 문의: 학생문화팀(
              <a href="tel:053-850-5214" className="font-semibold text-ink underline">
                053-850-5214
              </a>
              )
            </li>
          </ul>
        </div>
      </details>
    </div>
  );
}
