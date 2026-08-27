import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Search } from '@/components/duing/Icon';
import { SparkleFull } from '@/components/duing/Sparkle';
import { fetchClubStats } from '@/app/_lib/club-stats';
import { cn } from '@/app/_lib/cn';
import { resolveHeroToasts, type HeroToast } from './hero-activity';
import { HeroActivityToasts } from './HeroActivityToasts';
import { fetchPublicActivities } from '@/app/_lib/public-activities';

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
          {/* 모바일: 헤드라인 우측에 마스코트(두두)를 겹쳐 둔다 — 시안의 모바일 히어로 구성.
              데스크탑은 우측 일러스트가 같은 역할을 하므로 md 이상에서 숨긴다.
              헤드라인 뒤에 깔리되 클릭을 가로채지 않도록 z-0 + pointer-events-none. */}
          <Image
            src="/duing-hero-confetti.png"
            alt=""
            aria-hidden
            width={678}
            height={449}
            priority
            draggable={false}
            className="pointer-events-none absolute -right-4 -top-4 z-0 w-[230px] select-none md:hidden"
          />
          <Image
            src="/duing-mascot.png"
            alt="두잉 마스코트 두두"
            width={531}
            height={441}
            priority
            draggable={false}
            className="pointer-events-none absolute -right-3 -top-2 z-0 w-[176px] select-none md:hidden"
          />

          {/* 시안의 히어로는 헤드라인부터 시작한다 — 'DU + ING' 배지는 PC·모바일 모두 두지 않는다. */}
          <h1 className="type-display relative z-[1] mb-4 text-[34px] leading-[1.28] tracking-tightest sm:mb-9 sm:text-[44px] md:text-[56px] lg:text-[64px] xl:text-[72px]">
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

          {/* 본문 카피 — 시안은 모바일에도 노출한다(예전에는 히어로를 압축하려 숨겼다).
              카피는 마스코트 아래에 오므로 폭을 좁히지 않고, 글자만 한 단계 작게 둔다.
              통계 미가용(stats=null) 시 숫자 없는 기본 카피로 우아하게 폴백한다. */}
          <p className="relative z-[1] mb-3 text-[14px] leading-[1.6] text-charcoal-2 sm:max-w-[500px] sm:text-lg md:mb-9">
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
        </div>

        <HeroRightVisual toasts={toasts} />
      </div>
    </section>
  );
}

// 테스트용 export — 런타임에선 HomeHero 가 렌더한다.
export function HeroRightVisual({ toasts }: { toasts: HeroToast[] }) {
  return (
    // 모바일(<md)에선 우측 비주얼 전체 숨김. 내부 relative 박스 폭을 일러스트 폭에 맞춰,
    // 토스트가 일러스트 가장자리에 자연스럽게 겹쳐 뜨도록 한다(의도된 겹침).
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

        {/* 활동 토스트 — 시안대로 일러스트 우측 상단 한 자리에만 두고, 나머지는 옆으로 밀어 본다. */}
        <div className="absolute right-1 top-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 delay-300 motion-reduce:animate-none lg:right-3 lg:top-16">
          <HeroActivityToasts toasts={toasts} />
        </div>
      </div>
    </div>
  );
}
