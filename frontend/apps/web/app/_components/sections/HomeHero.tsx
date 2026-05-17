import Link from 'next/link';
import { ArrowRight, Search } from '@/components/duing/Icon';
import { Sparkle, SparkleFull } from '@/components/duing/Sparkle';

const SUGGESTED_QUERIES: ReadonlyArray<string> = [
  '주니어 개발자',
  'K-pop 댄스',
  '투자 스터디',
  '산악회',
  '그림 그리기',
];

export function HomeHero() {
  return (
    <section className="relative overflow-hidden px-10 pb-8 pt-16">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div
        className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full opacity-70 blur-[8px]"
        style={{
          background: 'radial-gradient(circle at 40% 40%, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto grid items-center gap-16 md:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full bg-sage-mist px-3 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.14em] text-ink-deep">
            <Sparkle size={11} color="#143025" />
            DU + ING
          </div>

          <h1 className="mb-12 text-[84px] leading-none tracking-[-0.035em]">
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

          <p className="mb-9 max-w-[500px] text-lg leading-[1.6] text-charcoal-2">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            <br />
            128개 동아리가 지금도{' '}
            <em className="border-b-2 border-sage pb-px font-bold not-italic text-ink-deep">
              ing
            </em>{' '}
            중 — 이번 학기 67곳 모집 중이에요.
          </p>

          <form action="/clubs" method="get" className="flex max-w-[540px] items-center gap-1.5 rounded-lg bg-paper p-1.5 shadow-2">
            <label className="flex flex-1 items-center gap-3 px-[18px] py-3.5">
              <Search className="text-charcoal-3" />
              <input
                type="search"
                name="keyword"
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
                href={`/clubs?keyword=${encodeURIComponent(query)}`}
                className="rounded-full border border-dashed border-line px-3 py-[5px] text-[13px] font-medium text-charcoal-2 hover:border-ink hover:text-ink"
              >
                {query}
              </Link>
            ))}
          </div>
        </div>

        <HeroCardStack />
      </div>
    </section>
  );
}

function HeroCardStack() {
  return (
    <div className="relative h-[540px]">
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
          67<span className="text-lg">곳</span>
        </div>
        <div className="mt-1 text-[11.5px] text-ink/70">이번 학기 모집중</div>
      </div>
    </div>
  );
}
