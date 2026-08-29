import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

import { ChevronRight } from 'lucide-react';
import { ClubLogo } from '@/app/_components/ClubLogo';
import { fetchInterestingClubs } from '@/app/_lib/home-data';
import { HOME_CATEGORY_BY_VALUE } from '@/app/_lib/homeCategories';
import { displayStatusLabel } from '@/app/_lib/recruitmentDisplay';
import { cn } from '@/app/_lib/cn';

/**
 * 주간 관심 인원 문구를 노출할 최소 인원.
 *
 * <p>이 값 미만이면 숫자를 아예 쓰지 않는다. "이번 주에 2명이 관심을 보였어요" 는 추천으로 읽히지
 * 않고 오히려 한산해 보이는 역효과가 나기 때문이다 — 그래서 카드에서 그 줄만 빠지고, 순위 자체는
 * (표시되지 않는) 관심도 점수 그대로 유지된다.
 */
const MIN_VISIBLE_INTEREST_COUNT = 5;

const CARD_COUNT = 4;

export async function InterestingClubs() {
  const clubs = await fetchInterestingClubs(CARD_COUNT);
  if (clubs.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 md:px-10 py-7 sm:py-14">
      <div className="max-w-layout mx-auto">
        <div className="mb-5 flex items-center justify-between md:mb-10">
          <h2 className="text-[20px] md:text-[36px]">관심도가 높은 동아리</h2>
          {/* 아이콘만 있는 링크라 접근명을 직접 단다 — 인라인 텍스트가 없으면 스크린리더가 읽을 게 없다.
              시안은 딥그린 원 안의 캐럿이지만 제목 옆에서 무게가 과해 캐럿만 둔다 — 면 없이 글자색으로만.
              히트 영역은 44px 박스로 유지하고, 글리프 우측이 카드 열 끝선에 오도록 박스 여백만큼 당긴다. */}
          <Link
            href="/clubs"
            aria-label="관심도가 높은 동아리 전체 보기"
            className="-mr-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-deep transition hover:bg-sage-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
          >
            <ChevronRight size={24} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>

        {/* 데스크탑: lg 부터 4열, md(768~1023)는 2×2. md 에서 4열이면 카드가 157~221px 이라 로고 82 + 배지가
            한 줄에 안 들어가 배지가 박스 밖으로 튄다(실측 768 에서 36px). 2열이면 카드가 334px 이상이라
            고정 크기 그대로 안전하다.
            lg 부터는 카드 폭이 221~285px 로 흔들리므로 카드를 통째로 비례 축소한다 — 래퍼를 컨테이너 쿼리
            컨테이너로 두고 카드 글자 크기를 폭의 %(cqw)로 잡으면 em 단위 내부 치수가 함께 줄어 1280 의 모양이
            그대로 유지된다(1024 에서 0.78 배). 이 레포의 첫 컨테이너 쿼리 사용처. */}
        <div className="hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-4">
          {clubs.map((club) => (
            <div key={club.id} className="lg:[container-type:inline-size]">
              <InterestCard club={club} />
            </div>
          ))}
        </div>

        {/* 모바일: 세로 리스트. 홈에 이미 배너·티커라는 가로 이동 요소가 둘 있어 캐러셀을 더 얹지 않는다. */}
        <div className="flex flex-col gap-2 md:hidden">
          {clubs.map((club) => (
            <InterestRow key={club.id} club={club} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** 표시 임계값을 넘긴 경우에만 "이번 주에 N명" 문구를 만든다. 그 외에는 null. */
function visibleInterestCount(club: ClubSummary): number | null {
  const count = club.weeklyInterestCount ?? 0;
  return count >= MIN_VISIBLE_INTEREST_COUNT ? count : null;
}

function statusBadge(club: ClubSummary): { label: string; className: string } | null {
  const displayStatus = club.activeRecruitment?.displayStatus;
  if (!displayStatus) return null;
  const isOpen = displayStatus === 'OPEN' || displayStatus === 'ALWAYS_OPEN';
  return {
    label: displayStatusLabel(displayStatus),
    className: isOpen
      ? 'bg-ink-deep text-cream'
      : displayStatus === 'UPCOMING'
        ? 'bg-sage-mist text-charcoal-2'
        : 'bg-graysoft text-charcoal-2',
  };
}

/**
 * 카드 로고 — 이미지 로드 실패 시 이니셜로 떨어지는 공용 ClubLogo 를 쓴다.
 * 직접 <img> 를 그리면 삭제된 스토리지 URL 에서 깨진 이미지 아이콘이 그대로 노출된다(실제로 관측).
 * 컨테이너가 relative·overflow-hidden·크기·배경을 책임진다는 게 그 컴포넌트의 계약이다.
 */
function ClubCardLogo({ club, className }: { club: ClubSummary; className?: string }) {
  const color = HOME_CATEGORY_BY_VALUE[club.category].labelColor;
  return (
    <span
      aria-hidden
      className={cn('relative grid shrink-0 place-items-center overflow-hidden font-bold', className)}
      style={{ background: `${color}1f`, color }}
    >
      <ClubLogo logoUrl={club.logoUrl}>{club.name.charAt(0)}</ClubLogo>
    </span>
  );
}

function InterestCard({ club }: { club: ClubSummary }) {
  const badge = statusBadge(club);
  const interestCount = visibleInterestCount(club);

  return (
    // 카드 안 치수는 전부 em — 기준 글자 16px(=1280 의 카드 폭 285 × 5.614%)에서 로고 82·제목 30·배지 14·
    // 패딩 22·최소 높이 290 이 나온다. lg 부터 루트 글자를 cqw 로 잡아 폭에 비례해 전체가 같이 줄고,
    // md(2열)는 16px 고정이라 예전 px 값과 동일하다. 글자 크기를 바꾸는 요소(로고·배지·제목)는 자기 크기
    // 기준으로 다시 환산했다(로고 82/30 = 2.733em).
    <Link
      href={`/clubs/${club.id}`}
      className="group flex h-full min-h-[290px] flex-col rounded-[1.5em] border border-line bg-paper p-[1.375em] text-[16px] transition duration-250 ease-duing hover:-translate-y-1 hover:shadow-3 motion-reduce:transition-none lg:min-h-[101.75cqw] lg:text-[5.614cqw]"
    >
      <div className="flex items-start justify-between gap-[0.75em]">
        <ClubCardLogo club={club} className="h-[2.733em] w-[2.733em] rounded-[0.6em] text-[1.875em]" />
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded-full px-[1em] py-[0.571em] text-[0.875em] font-semibold leading-none',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="mt-[0.875em] flex min-w-0 items-baseline gap-[0.5em]">
        <h3 className="type-card-title min-w-0 truncate text-[1.875em]">{club.name}</h3>
        <span
          className="shrink-0 text-[1em] font-semibold tracking-tightest"
          style={{ color: HOME_CATEGORY_BY_VALUE[club.category].labelColor }}
        >
          {HOME_CATEGORY_BY_VALUE[club.category].label}
        </span>
      </div>
      <p className="mt-[0.25em] line-clamp-2 text-[1em] font-normal leading-[1.5] tracking-tightest text-charcoal-2">
        {club.tagline ?? (club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중')}
      </p>

      {/* 임계값 미만이면 이 줄만 빠진다 — 카드 최소 높이는 유지돼 그리드가 흔들리지 않는다. */}
      {interestCount !== null && (
        <p className="mt-auto pt-[1.75em] text-[1em] font-normal leading-[1.5] tracking-tightest text-ink-deep">
          이번 주에
          <br />
          <span className="font-bold">{interestCount}명</span>이 관심을 보였어요
        </p>
      )}
    </Link>
  );
}

function InterestRow({ club }: { club: ClubSummary }) {
  const badge = statusBadge(club);

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="flex h-[76px] items-center gap-3 rounded-[10px] border border-line bg-paper px-3 transition active:scale-[0.99]"
    >
      <ClubCardLogo club={club} className="h-[53px] w-[53px] rounded-[10px] text-[20px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate text-[18px] font-semibold tracking-tightest text-ink">
              {club.name}
            </span>
            <span
              className="shrink-0 text-[12px] font-semibold tracking-tightest"
              style={{ color: HOME_CATEGORY_BY_VALUE[club.category].labelColor }}
            >
              {HOME_CATEGORY_BY_VALUE[club.category].label}
            </span>
          </div>
          {badge && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p className="truncate text-[14px] font-normal tracking-tightest text-charcoal-2">
          {club.tagline ?? (club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중')}
        </p>
      </div>
    </Link>
  );
}
