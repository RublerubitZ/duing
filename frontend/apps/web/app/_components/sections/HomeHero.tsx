import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Search } from '@/components/duing/Icon';
import { Sparkle, SparkleFull } from '@/components/duing/Sparkle';
import { fetchClubStats } from '@/app/_lib/club-stats';
import { cn } from '@/app/_lib/cn';
import { resolveHeroToasts, type HeroToast } from './hero-activity';
import { fetchPublicActivities } from '@/app/_lib/public-activities';
import { RECRUITING_CLUBS_HREF } from '@/app/_lib/exploreLinks';

// 통계 조회 실패("—곳") 시 링크 접근명 — 대시만 읽히지 않도록 링크 자체에 건다.
// 숫자 div(role=generic)에 aria-label 을 두면 ARIA 금지 속성이 된다.
const RECRUITING_UNKNOWN_LABEL = '모집 현황 정보 없음 — 이번 학기 모집중 동아리 보기';

const SUGGESTED_QUERIES: ReadonlyArray<string> = [
  '개발',
  '공모전',
  '봉사',
  '축구',
  '창업',
];

export async function HomeHero() {
  // 통계·활동을 병렬 조회. 활동 조회 실패 시 [] → resolveHeroToasts 가 폴백 토스트로 채운다.
  const [stats, activities] = await Promise.all([fetchClubStats(), fetchPublicActivities()]);
  const now = new Date();
  const toasts = resolveHeroToasts(activities, now);
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 md:px-10 pb-3 pt-3 sm:pb-8 sm:pt-6">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div
        className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full opacity-70 blur-[8px]"
        style={{
          background: 'radial-gradient(circle at 40% 40%, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto grid items-center gap-8 md:grid-cols-[1.15fr_1fr] lg:grid-cols-[0.82fr_1.18fr]">
        <div className="relative">
          {/* 모바일: 헤드라인 우측 — 모집 현황 카드만 작게 노출(활동 토스트는 데스크탑 전용).
              우측 비주얼(일러스트·토스트)이 숨겨지는 모바일에서도 모집 현황은 전달한다.
              stats null(조회 실패) 시에도 카드는 "—곳"으로 폴백(데스크탑 카드와 동일 규약). */}
          <Link
            href={RECRUITING_CLUBS_HREF}
            aria-label={stats ? undefined : RECRUITING_UNKNOWN_LABEL}
            className="md:hidden absolute right-0 top-[44px] z-[3] w-[130px] rounded-xl border border-sage-soft bg-sage-mist px-3.5 py-2.5 shadow-1 transition duration-250 ease-duing active:scale-95 motion-reduce:transition-none"
          >
            <div className="font-display text-[28px] font-bold leading-none text-ink">
              {stats ? stats.recruitingCount : '—'}
              <span className="text-sm font-bold">곳</span>
            </div>
            <div className="mt-0.5 text-[10.5px] font-medium leading-tight text-ink/75">
              이번 학기 모집중
            </div>
          </Link>

          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sage-mist px-3 py-1.5 font-mono text-[11.5px] font-bold tracking-[0.14em] text-ink-deep sm:mb-[22px]">
            <Sparkle size={11} color="#143025" />
            DU + ING
          </div>

          <h1 className="mb-2.5 text-[40px] leading-none tracking-[-0.035em] sm:mb-12 sm:text-[52px] md:text-[64px] lg:text-[72px] xl:text-[84px]">
            오늘,
            <br />
            캠퍼스의
            <br />
            모든{' '}
            <span className="relative inline-block">
              <span className="text-ink-deep">두</span>
              <span className="text-ink">잉</span>
              <SparkleFull size={48} color="#9DB6A0" className="absolute -right-11 -top-2.5" />
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
          <form action="/clubs" method="get" className="hidden max-w-[540px] items-center gap-1.5 rounded-lg bg-paper p-1.5 shadow-2 ring-ink/40 focus-within:ring-2 md:flex">
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

// 테스트용 export — 런타임에선 HeroRightVisual(데스크탑·태블릿)만 렌더한다.
// 사이즈 2단: 태블릿(기본, md 미만에선 렌더되지 않음) · 데스크탑(lg) 확대.
export function HeroActivityToast({ variant, clubName, message, timeAgo }: HeroToast) {
  const isDark = variant === 'dark';
  return (
    <div
      className={cn(
        'w-[182px] rounded-md px-3 py-2 shadow-3 transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-4 motion-reduce:transition-none lg:w-[230px] lg:px-4 lg:py-3',
        isDark ? 'bg-ink-deep text-cream' : 'border border-line bg-paper text-ink',
      )}
    >
      <div className="flex items-center gap-1.5 lg:gap-2">
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full lg:h-2 lg:w-2', isDark ? 'bg-warm' : 'bg-sage')}
        />
        <span
          className={cn(
            'text-[11.5px] font-bold lg:text-[13px]',
            isDark ? 'text-cream' : 'text-ink',
          )}
        >
          {clubName}
        </span>
        <span
          className={cn(
            'ml-auto text-[10px] lg:text-[11px]',
            isDark ? 'text-cream/60' : 'text-charcoal-3',
          )}
        >
          {timeAgo}
        </span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11px] leading-snug lg:mt-1 lg:text-[12.5px]',
          isDark ? 'text-cream/85' : 'text-charcoal-2',
        )}
      >
        {message}
      </div>
    </div>
  );
}

// 테스트용 export — 런타임에선 HomeHero 가 렌더한다.
export function HeroRightVisual({
  recruitingCount,
  toasts,
}: {
  recruitingCount: number | null;
  toasts: [HeroToast, HeroToast];
}) {
  return (
    // 모바일(<md)에선 우측 비주얼 전체 숨김. 내부 relative 박스 폭을 일러스트 폭에 맞춰,
    // 모집중 카드·토스트가 일러스트 가장자리에 자연스럽게 겹쳐 뜨도록 한다(의도된 겹침).
    <div className="hidden md:block">
      <div className="relative mx-auto w-full max-w-[560px] lg:max-w-[760px]">
        {/* 브랜드 일러스트 — 우측 메인 비주얼(박스를 가득 채움). drop-shadow 없음, 드래그 방지. */}
        <Image
          src="/duing-illustration.png"
          alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션"
          width={1536}
          height={1024}
          priority
          fetchPriority="high"
          draggable={false}
          className="h-auto w-full object-contain animate-in fade-in-0 zoom-in-95 duration-700 motion-reduce:animate-none"
        />

        {/* 모집중 카드 — 일러스트 좌상단에 겹쳐 뜨는 실데이터 카드 + hover 반응. null="—곳", 0="0곳". */}
        <div className="absolute left-1 top-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-150 motion-reduce:animate-none lg:left-2 lg:top-2">
          <Link
            href={RECRUITING_CLUBS_HREF}
            aria-label={recruitingCount === null ? RECRUITING_UNKNOWN_LABEL : undefined}
            className="block rounded-md border border-sage-soft bg-sage-mist px-4 py-3 shadow-3 transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-4 motion-reduce:transition-none lg:px-5 lg:py-4"
          >
            <div className="font-display text-[30px] font-bold leading-none text-ink lg:text-[36px]">
              {recruitingCount === null ? '—' : recruitingCount}
              <span className="text-base lg:text-lg">곳</span>
            </div>
            <div className="mt-1 text-[11px] text-ink/70 lg:text-[11.5px]">이번 학기 모집중</div>
          </Link>
        </div>

        {/* Toast 1 — 일러스트 좌하단에 겹치게 안쪽으로. */}
        <div className="absolute bottom-6 left-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-300 motion-reduce:animate-none lg:bottom-10 lg:left-3">
          <HeroActivityToast {...toasts[0]} />
        </div>

        {/* Toast 2 — 일러스트 우측 상단에 겹치게(캐릭터 머리 위 빈 영역). */}
        <div className="absolute right-1 top-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-500 motion-reduce:animate-none lg:right-3 lg:top-16">
          <HeroActivityToast {...toasts[1]} />
        </div>
      </div>
    </div>
  );
}
