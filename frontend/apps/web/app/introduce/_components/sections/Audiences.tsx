import { ArrowRight, Check } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';

const STUDENT_FEATURES: ReadonlyArray<string> = [
  '탐색 · 검색 · 카테고리 필터',
  '지원서 작성 + 자동 임시 저장',
  '면접·결과 알림 받기',
  '내 활동·찜 동아리 마이페이지',
];

const LEADER_FEATURES: ReadonlyArray<string> = [
  '지원자 검토 · 면접 일정 · 합격자 알림',
  '공지·일정 게시 + 부원 전체 발송',
  '회비 정산 · 출석 · 활동 통계',
  '동아리 페이지 직접 편집',
];

export function Audiences() {
  return (
    <section className="px-4 sm:px-6 md:px-10 py-[120px]">
      <div className="max-w-layout mx-auto">
        <div className="mb-14 text-center">
          <div className="mb-3.5 text-[13px] font-bold tracking-wide16 text-ink">
            FOR EVERYONE · 누구든 환영해요
          </div>
          <h2 className="text-[48px] leading-[1.1]">동아리에 관심 있는 모두를 위해</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-xl border border-line bg-paper p-11">
            <SparkleFull size={36} color="#9DB6A0" className="absolute right-7 top-7" />
            <div className="mb-5 inline-flex rounded-full bg-sage-mist px-3 py-1 text-[11.5px] font-bold tracking-wide06 text-ink-deep">
              학생 · STUDENTS
            </div>
            <h3 className="mb-4 text-[36px] leading-[1.15]">
              찾고, 지원하고,
              <br />
              활동까지 한 곳에서
            </h3>
            <p className="mb-7 text-[14.5px] leading-[1.7] text-charcoal-2">
              관심사에 맞는 동아리를 찾아 바로 지원하세요. 찜한 동아리는 마감 임박 시 알림으로 알려드려요.
            </p>
            <div className="mb-7 flex flex-col gap-2.5">
              {STUDENT_FEATURES.map((feature) => (
                <div key={feature} className="flex gap-2.5 text-sm text-charcoal">
                  <Check size={16} className="mt-0.5 shrink-0 text-ink" />
                  {feature}
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary rounded-md">
              학생으로 시작하기
              <ArrowRight />
            </button>
          </div>

          <div
            className="relative overflow-hidden rounded-xl p-11 text-white"
            style={{ background: 'linear-gradient(135deg, #1F4A36 0%, #143025 100%)' }}
          >
            <SparkleFull size={36} color="#9DB6A0" className="absolute right-7 top-7" />
            <div
              className="mb-5 inline-flex rounded-full px-3 py-1 text-[11.5px] font-bold tracking-wide06 text-sage"
              style={{ background: 'rgba(157,182,160,0.18)' }}
            >
              운영자 · CLUB LEADERS
            </div>
            <h3 className="mb-4 text-[36px] leading-[1.15] text-white">
              지원자 관리부터
              <br />
              회비 정산까지
            </h3>
            <p className="mb-7 text-[14.5px] leading-[1.7] text-white/70">
              회장단이 노션·엑셀·구글폼으로 나눠 쓰던 일을 한 번에. 동아리 페이지부터 모집·운영까지 두잉에서 관리하세요.
            </p>
            <div className="mb-7 flex flex-col gap-2.5">
              {LEADER_FEATURES.map((feature) => (
                <div key={feature} className="flex gap-2.5 text-sm text-white/85">
                  <Check size={16} className="mt-0.5 shrink-0 text-sage" />
                  {feature}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn rounded-md bg-sage px-[22px] py-3 font-bold text-ink-deep"
            >
              우리 동아리 등록하기
              <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}