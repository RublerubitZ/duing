import Link from 'next/link';
import { ArrowRight, Search } from '@/components/duing/Icon';
import { Sparkle, SparkleFull } from '@/components/duing/Sparkle';
import { fetchClubStats } from '@/app/_lib/club-stats';

const SUGGESTED_QUERIES: ReadonlyArray<string> = [
  '개발',
  '공모전',
  '봉사',
  '축구',
  '창업',
];

export async function HomeHero() {
  const { totalCount, recruitingCount } = await fetchClubStats();
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 md:px-10 pb-8 pt-16">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div
        className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full opacity-70 blur-[8px]"
        style={{
          background: 'radial-gradient(circle at 40% 40%, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto grid items-center gap-16 md:grid-cols-[1.15fr_1fr]">
        <div className="relative">
          {/* 모바일: 헤드라인 우측 여백의 작은 통계 칩 (#2) — 데스크탑은 우측 카드스택이 담당 */}
          <div className="md:hidden absolute right-0 top-[60px] z-[3] w-[118px] rounded-2xl border border-sage-soft bg-sage-mist/95 px-3 py-2.5 backdrop-blur-sm">
            <div className="font-display text-[28px] font-bold leading-none text-ink">
              {recruitingCount}
              <span className="text-[15px] font-bold">곳</span>
            </div>
            <div className="mt-1 text-[11px] font-medium leading-tight text-ink/80">
              이번 학기 모집중
            </div>
            <div className="mt-1.5 border-t border-ink/10 pt-1.5 text-[10.5px] leading-tight text-ink/80">
              {totalCount}개 동아리 ing중
            </div>
          </div>

          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full bg-sage-mist px-3 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.14em] text-ink-deep">
            <Sparkle size={11} color="#143025" />
            DU + ING
          </div>

          <h1 className="mb-12 text-[44px] leading-none tracking-[-0.035em] sm:text-[60px] md:text-[84px]">
            오늘,
            <br />
            캠퍼스의
            <br />
            모든{' '}
            <span className="relative inline-block pb-[22px]">
              <span className="relative inline-block">
                <span className="text-ink-deep">두</span>
                <span className="text-ink">잉</span>
                <SparkleFull
                  size={48}
                  color="#9DB6A0"
                  className="absolute -right-11 -top-2.5"
                />
              </span>
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-1 left-1 right-1 flex justify-between font-mono text-[11px] font-bold tracking-[0.16em] text-charcoal-3"
              >
                <span className="inline-flex flex-col items-center gap-[3px]">
                  <span className="h-px w-3.5 bg-charcoal-3 opacity-50" />
                  DU
                </span>
                <span className="inline-flex flex-col items-center gap-[3px]">
                  <span className="h-px w-3.5 bg-charcoal-3 opacity-50" />
                  ING
                </span>
              </span>
            </span>
            .
          </h1>

          <p className="mb-9 max-w-[500px] text-base leading-[1.6] text-charcoal-2 sm:text-lg">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            {/* 통계 문구는 모바일에선 우측 칩으로 이동, 데스크탑에선 본문 유지 (#2) */}
            <span className="hidden md:inline">
              <br />
              {totalCount}개 동아리가 지금도{' '}
              <em className="border-b-2 border-sage pb-px font-bold not-italic text-ink-deep">
                ing
              </em>{' '}
              중 — 이번 학기 {recruitingCount}곳 모집 중이에요.
            </span>
          </p>

          {/* 데스크탑 전용 검색 — 모바일은 상단 고정 검색 바(HomeMobileSearchBar)가 담당 (#3) */}
          <form action="/clubs" method="get" className="hidden max-w-[540px] items-center gap-1.5 rounded-lg bg-paper p-1.5 shadow-2 md:flex">
            <label className="flex flex-1 items-center gap-3 px-[18px] py-3.5">
              <Search className="text-charcoal-3" />
              <input
                type="search"
                name="q"
                placeholder="동아리 이름, 키워드, 카테고리로 검색"
                className="flex-1 border-none bg-transparent text-[15px] text-charcoal outline-none"
              />
            </label>
            <button type="submit" className="btn btn-primary rounded-md px-[22px] py-3.5">
              검색
              <ArrowRight />
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] text-charcoal-3">요즘 많이 찾는</span>
            {SUGGESTED_QUERIES.map((query) => (
              <Link
                key={query}
                href={`/clubs?q=${encodeURIComponent(query)}`}
                className="rounded-full border border-dashed border-line px-3 py-[5px] text-[13px] font-medium text-charcoal-2 hover:border-ink hover:text-ink"
              >
                {query}
              </Link>
            ))}
          </div>
        </div>

        <HeroCardStack recruitingCount={recruitingCount} />
      </div>
    </section>
  );
}

function HeroCardStack({ recruitingCount }: { recruitingCount: number }) {
  // 회전 콜라주는 360px 폭에서 절대배치 카드들이 bleed 되므로 모바일에선 숨긴다(장식 — 정보는 서브카피·검색이 담당).
  return (
    <div className="relative hidden h-[540px] md:block">
      <div
        className="absolute right-10 top-10 w-[280px] rounded-lg border border-line bg-paper p-4 shadow-2"
        style={{ transform: 'rotate(7deg)' }}
      >
        <div
          className="grid h-[132px] place-items-center rounded-md text-[48px]"
          style={{
            background: 'linear-gradient(135deg, #B6567222 0%, #B6567211 100%)',
          }}
        >
          🎸
        </div>
        <div className="mt-3">
          <span className="pill pill-berry" style={{ fontSize: 11 }}>
            음악
          </span>
          <h3 className="mt-2 text-[17px]">트레몰로</h3>
          <p className="text-[12.5px] text-charcoal-3">어쿠스틱 기타 합주</p>
        </div>
      </div>

      <div
        className="absolute right-[200px] top-[110px] w-[300px] rounded-lg border border-line bg-paper p-4 shadow-3"
        style={{ transform: 'rotate(-4deg)' }}
      >
        <div
          className="grid h-[156px] place-items-center rounded-md font-mono text-[44px] font-bold text-ink"
          style={{
            background: 'linear-gradient(135deg, #1F4A3622 0%, #1F4A3611 100%)',
          }}
        >
          {'{ }'}
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <span className="pill" style={{ fontSize: 11 }}>
              IT
            </span>
            <span className="text-[11.5px] text-charcoal-3">· 10기</span>
          </div>
          <h3 className="mt-2 text-[18px]">두잉코드</h3>
          <p className="text-[12.5px] text-charcoal-3">주니어 개발자 모임</p>
          <div className="mt-3 flex justify-between border-t border-dashed border-line pt-2.5 text-xs">
            <span className="text-charcoal-2">모집 20명</span>
            <span className="font-bold text-ink">~ 9.27</span>
          </div>
        </div>
      </div>

      <div
        className="absolute right-20 top-[360px] w-[220px] rounded-md bg-ink p-3 text-white shadow-3"
        style={{ transform: 'rotate(3deg)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-white/15 text-[22px]">
            📊
          </div>
          <div>
            <div className="text-sm font-bold">STAT</div>
            <div className="text-[11.5px] opacity-75">면접 확정!</div>
          </div>
          <Sparkle size={20} color="#9DB6A0" className="ml-auto" />
        </div>
      </div>

      <div
        className="absolute left-7 top-0 rounded-md border border-sage-soft bg-sage-mist px-5 py-4"
        style={{ transform: 'rotate(-6deg)' }}
      >
        <div className="font-display text-[36px] font-bold leading-none text-ink">
          {recruitingCount}<span className="text-lg">곳</span>
        </div>
        <div className="mt-1 text-[11.5px] text-ink/70">이번 학기 모집중</div>
      </div>
    </div>
  );
}
