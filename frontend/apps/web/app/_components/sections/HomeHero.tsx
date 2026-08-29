import Image from 'next/image';
import { Search } from '@/components/duing/Icon';
import { fetchClubStats } from '@/app/_lib/club-stats';
import { resolveHeroToasts, type HeroToast } from './hero-activity';
import { HeroActivityToasts } from './HeroActivityToasts';
import { fetchPublicActivities } from '@/app/_lib/public-activities';

export async function HomeHero() {
  // 통계·활동을 병렬 조회. 활동 조회 실패 시 [] → resolveHeroToasts 가 폴백 토스트로 채운다.
  const [stats, activities] = await Promise.all([fetchClubStats(), fetchPublicActivities()]);
  const now = new Date();
  const toasts = resolveHeroToasts(activities, now);
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 md:px-10 pb-3 pt-3 sm:pb-8 sm:pt-6 xl:pt-16">
      <div className="bg-grid absolute inset-0 opacity-50" />
      {/* 우상단 세이지 블러 원은 PC 시안 전용 — 모바일 프레임(509:8861)의 배경은 크림 단색이라 md 부터만 그린다. */}
      <div
        className="absolute -right-40 -top-32 hidden h-[520px] w-[520px] rounded-full opacity-70 blur-[8px] md:block"
        style={{
          background: 'radial-gradient(circle at 40% 40%, #C9D8CC 0%, #F6F3EC 70%)',
        }}
      />

      <div className="max-w-layout relative mx-auto grid items-center gap-8 md:grid-cols-[1.15fr_1fr] lg:grid-cols-[0.82fr_1.18fr]">
        {/* 모바일은 헤드라인 옆 마스코트가 헤드라인보다 아래로 내려오므로(시안: 헤드라인 위 +25 → 발 172px,
            다음 요소까지 33px) 컬럼 높이를 184px 로 잡는다 — 없으면 section overflow-hidden 에 발이 잘린다. */}
        <div className="relative min-h-[184px] md:min-h-0">
          {/* 모바일: 헤드라인 우측에 마스코트(두두)와 종이조각 장식을 겹쳐 둔다 — 모바일 프레임(509:8861) 좌표를
              콘텐츠 박스(x16, 헤드라인 y125) 기준으로 옮긴 값: 컨페티 그룹 (150,125) 226×150·불투명도 0.7 →
              right-0 top-0, 마스코트 (180,150) 177×147 → 오른쪽 여백 20 = right-5, top-6.
              장식(컨페티)은 preload 하지 않는다 — priority 는 CSS 를 모르고 link[rel=preload] 를 항상
              심어서, md:hidden 이라도 데스크탑이 쓰지 않을 이미지를 내려받게 된다.
              데스크탑은 우측 일러스트가 같은 역할을 하므로 md 이상에서 숨긴다.
              헤드라인 뒤에 깔리되 클릭을 가로채지 않도록 z-0 + pointer-events-none. */}
          <Image
            src="/duing-hero-confetti.png"
            alt=""
            aria-hidden
            width={678}
            height={449}
            draggable={false}
            className="pointer-events-none absolute right-0 top-0 z-0 w-[226px] select-none opacity-70 md:hidden"
          />
          {/* 마스코트만 preload 한다 — 모바일 히어로의 LCP 후보라 lazy 로 두면 한 왕복만큼 늦는다.
              데스크탑에서도 받게 되는 낭비는 감수한다(우측 일러스트가 모바일에서 그런 것과 같은 맞교환).
              장식인 컨페티는 그럴 이유가 없어 위에서 preload 하지 않는다. */}
          <Image
            src="/duing-mascot.png"
            alt="두잉 마스코트 두두"
            width={531}
            height={441}
            priority
            draggable={false}
            className="pointer-events-none absolute right-5 top-6 z-0 w-[177px] select-none md:hidden"
          />

          {/* 시안의 히어로는 헤드라인부터 시작한다 — 'DU + ING' 배지는 PC·모바일 모두 두지 않는다. */}
          <h1 className="type-display relative z-[1] mb-4 text-[34px] tracking-tightest sm:mb-9 sm:text-[44px] md:text-[56px] lg:text-[64px] xl:text-[78px]">
            오늘,
            <br />
            캠퍼스의
            <br />
            모든{' '}
            <span className="text-ink-deep">두</span>
            <span className="text-ink">잉</span>
            .
          </h1>

          {/* 본문 카피 — 모바일 시안(509:9210)대로 헤드라인 아래 두 줄, 폭 182 안에서 마스코트 왼쪽에 둔다
              (한 번 뺐다가 사용자 판단으로 되돌림). 글자 14px 은 시안(14/1.5)과 같고 행간만 1.6 으로 조금 넉넉하다.
              통계 미가용(stats=null) 시 숫자 없는 기본 카피로 우아하게 폴백한다. */}
          <p className="relative z-[1] mb-3 max-w-[190px] break-keep text-pretty text-[14px] leading-[1.6] text-charcoal-2 sm:max-w-[500px] sm:text-lg md:mb-9">
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

          {/* 데스크탑 전용 검색 — 모바일은 상단 고정 검색 바(HomeMobileSearchBar)가 담당 (#3).
              시안 PC 프레임(602×78, 모서리 22, 안쪽 좌 23·우 18, 버튼 115×61 '검색 + 돋보기' 22px)을
              콘텐츠 폭 기준 ×0.815 로 옮겼다: 490×64, 모서리 18, 버튼 50px, 글자 18px. 왼쪽 돋보기와
              섀도는 시안에 없어 뺐다 — 흰 면만으로 크림 위에서 분리되고 포커스는 링이 맡는다.
              시안 굵기는 Medium 이지만 Font Guide 에 500 이 없어 모바일 바처럼 입력 Regular·버튼 SemiBold. */}
          <form action="/clubs" method="get" className="hidden max-w-[490px] items-center gap-3 rounded-[18px] bg-paper py-[7px] pl-5 pr-4 ring-ink/40 focus-within:ring-2 md:flex">
            <input
              type="search"
              name="q"
              placeholder="찾으시는 동아리를 검색해주세요."
              aria-label="동아리 검색"
              className="min-w-0 flex-1 border-none bg-transparent text-[18px] tracking-tightest text-charcoal outline-none placeholder:text-charcoal-3"
            />
            <button
              type="submit"
              className="flex h-[50px] shrink-0 items-center gap-2 rounded-[18px] bg-ink-deep pl-5 pr-3.5 text-[18px] font-semibold tracking-tightest text-cream transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              검색
              <Search size={24} />
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
      {/* lg 부터는 박스를 컬럼보다 120px 넓혀 왼쪽으로 당긴다 — 시안(608:4884)의 그림은 콘텐츠 폭의 64%
          (1200 기준 ≈ 770px)로 헤드라인 끝 ~120px 오른쪽에서 시작하는데, 우측 컬럼(≈690)만으로는 그 크기가
          안 나온다. 넓힌 만큼 왼쪽 컬럼의 검색 버튼 위를 박스가 덮는데 그 자리는 그림의 투명 영역이다 —
          투명해도 박스·이미지는 클릭을 먹으므로 박스째 pointer-events-none 으로 통과시키고, 토스트만 다시 살린다. */}
      <div className="pointer-events-none relative mx-auto w-full max-w-[560px] lg:-ml-[120px] lg:w-[calc(100%+120px)] lg:max-w-none">
        {/* 브랜드 일러스트 — 우측 메인 비주얼(박스를 가득 채움). drop-shadow 없음, 드래그 방지.
            등장 애니메이션은 두지 않는다 — 새로고침마다 첫 화면이 다시 "나타나" 리로드처럼 읽히고,
            opacity 0 인 요소는 LCP 후보에서 빠지므로, 페이드가 시작돼 보이기 시작하는 시점만큼 LCP 가 늦어진다.
            파일명에 판 번호를 붙인다 — public 이미지는 1년 immutable 캐시라 같은 이름으로 덮으면 옛 그림이 남는다.
            원본의 투명 여백(좌 11·상 20·우 15·하 10%)은 2% 만 남기고 잘라 넣었다 — 여백째 넣으면 그림이 박스의 3/4 로 보인다. */}
        <Image
          src="/duing-illustration-2.png"
          alt="두잉 — 캠퍼스 동아리 활동 일러스트레이션"
          width={1643}
          height={1000}
          priority
          fetchPriority="high"
          draggable={false}
          className="h-auto w-full object-contain"
        />

        {/* 활동 토스트 — 시안대로 일러스트 우측 상단 한 자리에만 두고, 나머지는 옆으로 밀어 본다. */}
        <div className="pointer-events-auto absolute right-1 top-10 lg:right-3 lg:top-16">
          <HeroActivityToasts toasts={toasts} />
        </div>
      </div>
    </div>
  );
}
