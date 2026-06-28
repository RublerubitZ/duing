import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Search } from '@/components/duing/Icon';
import { Sparkle, SparkleFull } from '@/components/duing/Sparkle';
import { fetchClubStats } from '@/app/_lib/club-stats';
import { cn } from '@/app/_lib/cn';
import { resolveHeroToasts, type HeroToast } from './hero-activity';

const SUGGESTED_QUERIES: ReadonlyArray<string> = [
  '개발',
  '공모전',
  '봉사',
  '축구',
  '창업',
];

export async function HomeHero() {
  const stats = await fetchClubStats();
  // Phase A: 실활동 미조회 → 빈 입력으로 폴백 토스트 2개. Phase C 에서 [] 를 실데이터로 교체.
  const now = new Date();
  const toasts = resolveHeroToasts([], now);
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 md:px-10 pb-3 pt-5 sm:pb-8 sm:pt-16">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div
        className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full opacity-70 blur-[8px]"
        style={{
          background: 'radial-gradient(circle at 40% 40%, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto grid items-center gap-16 md:grid-cols-[1.15fr_1fr]">
        <div className="relative">
          {/* 모바일: 헤드라인 우측 여백의 모집 통계 — 데스크탑 카드스택과 같은 톤으로 깔끔한 2줄 (#1) */}
          {stats && (
            <div className="md:hidden absolute right-0 top-[54px] z-[3] rounded-xl border border-sage-soft bg-sage-mist px-4 py-3 shadow-1">
              <div className="font-display text-[32px] font-bold leading-none text-ink">
                {stats.recruitingCount}
                <span className="text-base font-bold">곳</span>
              </div>
              <div className="mt-1 text-[11px] font-medium leading-tight text-ink/75">
                이번 학기 모집중
              </div>
            </div>
          )}

          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sage-mist px-3 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.14em] text-ink-deep sm:mb-[22px]">
            <Sparkle size={11} color="#143025" />
            DU + ING
          </div>

          <h1 className="mb-2.5 text-[40px] leading-none tracking-[-0.035em] sm:mb-12 sm:text-[60px] md:text-[84px]">
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

          {/* 본문 카피 — 모바일에선 숨겨 히어로를 압축(#2·#6), 데스크탑만 노출.
              통계 미가용(stats=null) 시 숫자 없는 기본 카피로 우아하게 폴백한다. */}
          <p className="mb-9 hidden max-w-[500px] text-lg leading-[1.6] text-charcoal-2 md:block">
            대구대학교 동아리 플랫폼.
            <br />
            {stats ? (
              <>
                {stats.totalCount}개 동아리가 지금도{' '}
                <em className="border-b-2 border-sage pb-px font-bold not-italic text-ink-deep">
                  ing
                </em>{' '}
                중 — 이번 학기 {stats.recruitingCount}곳 모집 중이에요.
              </>
            ) : (
              <>
                캠퍼스의 모든 동아리가 지금도{' '}
                <em className="border-b-2 border-sage pb-px font-bold not-italic text-ink-deep">
                  ing
                </em>{' '}
                중이에요.
              </>
            )}
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

          {/* 추천 검색어 — 모바일에선 숨김(#3), 데스크탑만 노출 */}
          <div className="mt-5 hidden flex-wrap items-center gap-2.5 md:flex">
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

        <HeroRightVisual recruitingCount={stats?.recruitingCount ?? null} toasts={toasts} />
      </div>
    </section>
  );
}

// Test-only export — 테스트에서 직접 렌더하기 위해 노출(런타임은 HomeHero 만 사용).
export function HeroActivityToast({ variant, clubName, message, timeAgo }: HeroToast) {
  const isDark = variant === 'dark';
  return (
    <div
      className={cn(
        'w-[230px] rounded-md px-4 py-3 shadow-3 transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-4 motion-reduce:transition-none',
        isDark ? 'bg-ink-deep text-cream' : 'border border-line bg-paper text-ink',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', isDark ? 'bg-warm' : 'bg-sage')}
        />
        <span className={cn('text-[13px] font-bold', isDark ? 'text-cream' : 'text-ink')}>
          {clubName}
        </span>
        <span className={cn('ml-auto text-[11px]', isDark ? 'text-cream/60' : 'text-charcoal-3')}>
          {timeAgo}
        </span>
      </div>
      <div className={cn('mt-1 text-[12.5px]', isDark ? 'text-cream/85' : 'text-charcoal-2')}>
        {message}
      </div>
    </div>
  );
}

// Test-only export — 테스트에서 직접 렌더하기 위해 노출(런타임은 HomeHero 만 사용).
export function HeroRightVisual({
  recruitingCount,
  toasts,
}: {
  recruitingCount: number | null;
  toasts: [HeroToast, HeroToast];
}) {
  return (
    <div className="relative hidden h-[540px] md:block lg:h-[560px]">
      {/* 모집중 카드 — flow 상단(회전·absolute 제거). null="—곳"(중립), 0="0곳"(정당한 0). */}
      <div className="inline-block rounded-md border border-sage-soft bg-sage-mist px-5 py-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-150 motion-reduce:animate-none">
        <div className="font-display text-[36px] font-bold leading-none text-ink">
          {recruitingCount === null ? '—' : recruitingCount}
          <span className="text-lg">곳</span>
        </div>
        <div className="mt-1 text-[11.5px] text-ink/70">이번 학기 모집중</div>
      </div>

      {/* 브랜드 일러스트 — 우측 메인 비주얼. drop-shadow 없음, 드래그 방지. */}
      <Image
        src="/duing-illustration.png"
        alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션"
        width={1536}
        height={1024}
        priority
        fetchPriority="high"
        draggable={false}
        className="mx-auto mt-4 h-auto w-full max-w-[480px] object-contain animate-in fade-in-0 zoom-in-95 duration-700 motion-reduce:animate-none md:max-w-[400px] lg:max-w-[480px]"
      />

      {/* Toast 1 (좌하단) — offset 은 기준값, 최종은 후속 시각 QA 로 확정. */}
      <div className="absolute bottom-6 left-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-300 motion-reduce:animate-none md:bottom-4 md:left-2">
        <HeroActivityToast {...toasts[0]} />
      </div>

      {/* Toast 2 (우중단) — offset 은 기준값, 최종은 후속 시각 QA 로 확정. */}
      <div className="absolute right-0 top-28 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-500 motion-reduce:animate-none md:right-2 md:top-20">
        <HeroActivityToast {...toasts[1]} />
      </div>
    </div>
  );
}
