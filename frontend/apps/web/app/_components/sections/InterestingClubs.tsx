import Link from 'next/link';
import type { ClubSummary } from '@duing/types';

import { ArrowRight } from '@/components/duing/Icon';
import { fetchInterestingClubs } from '@/app/_lib/home-data';
import { displayStatusLabel } from '@/app/_lib/recruitmentDisplay';
import { cn } from '@/app/_lib/cn';

const CATEGORY_LABEL: Record<ClubSummary['category'], string> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

// 카테고리 액센트는 기존 팔레트를 그대로 쓴다 — 크림/세이지 브랜드 위에서 검증된 저채도 값이다.
const CATEGORY_COLOR: Record<ClubSummary['category'], string> = {
  ACADEMIC: '#1F4A36',
  CREATION: '#6b7e3e',
  ART: '#7d4f87',
  SPORTS: '#c47a3b',
  VOLUNTEER: '#b88b3b',
  RELIGION: '#a85e5e',
  HOBBY: '#4d6b8a',
  OTHER: '#3e7a73',
};

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
        <div className="mb-6 flex items-end justify-between sm:mb-9">
          <div>
            <div className="mb-2.5 hidden text-[13px] font-semibold tracking-wide08 text-ink sm:block">
              INTEREST · 최근 일주일
            </div>
            <h2 className="text-[20px] sm:text-[36px] md:text-[40px]">관심도가 높은 동아리</h2>
          </div>
          {/* 아이콘만 있는 링크라 접근명을 직접 단다 — 인라인 텍스트가 없으면 스크린리더가 읽을 게 없다. */}
          <Link
            href="/clubs"
            aria-label="관심도가 높은 동아리 전체 보기"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-deep text-cream transition duration-250 ease-duing hover:-translate-y-0.5 hover:shadow-3 motion-reduce:transition-none sm:h-10 sm:w-10"
          >
            <ArrowRight />
          </Link>
        </div>

        {/* 데스크탑: 4열 카드. Figma 카드(353×333)를 콘텐츠 폭 1280 에 맞춰 비례 축소한 값이다. */}
        <div className="hidden gap-5 md:grid md:grid-cols-4">
          {clubs.map((club) => (
            <InterestCard key={club.id} club={club} />
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
        ? 'bg-sage-mist text-charcoal-3'
        : 'bg-graysoft text-charcoal-3',
  };
}

function ClubLogo({ club, className }: { club: ClubSummary; className?: string }) {
  const color = CATEGORY_COLOR[club.category];
  if (club.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={club.logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn('shrink-0 object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center font-bold', className)}
      style={{ background: `${color}1f`, color }}
    >
      {club.name.charAt(0)}
    </span>
  );
}

function InterestCard({ club }: { club: ClubSummary }) {
  const badge = statusBadge(club);
  const interestCount = visibleInterestCount(club);

  return (
    <Link
      href={`/clubs/${club.id}`}
      className="group flex flex-col rounded-[24px] border border-line bg-paper p-6 transition duration-250 ease-duing hover:-translate-y-1 hover:shadow-3 motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <ClubLogo club={club} className="h-[72px] w-[72px] rounded-[20px] text-[28px]" />
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-none',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="mt-4 flex min-w-0 items-baseline gap-2">
        <h3 className="min-w-0 truncate text-[26px] leading-tight">{club.name}</h3>
        <span
          className="shrink-0 text-[14px] font-semibold"
          style={{ color: CATEGORY_COLOR[club.category] }}
        >
          {CATEGORY_LABEL[club.category]}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[14.5px] leading-relaxed text-charcoal-2">
        {club.tagline ?? (club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중')}
      </p>

      {/* 임계값 미만이면 이 줄만 빠진다 — 카드가 아래로 짧아질 뿐 레이아웃이 깨지지 않는다. */}
      {interestCount !== null && (
        <p className="mt-auto pt-6 text-[15.5px] leading-snug text-ink-deep">
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
      className="flex items-center gap-3 rounded-[10px] border border-line bg-paper px-3 py-2.5 transition active:scale-[0.99]"
    >
      <ClubLogo club={club} className="h-[53px] w-[53px] rounded-[10px] text-[20px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate text-[17px] font-semibold text-ink">{club.name}</span>
            <span
              className="shrink-0 text-[12px] font-semibold"
              style={{ color: CATEGORY_COLOR[club.category] }}
            >
              {CATEGORY_LABEL[club.category]}
            </span>
          </div>
          {badge && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-1 text-[10.5px] font-medium leading-none',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p className="truncate text-[13.5px] text-charcoal-2">
          {club.tagline ?? (club.tags.length > 0 ? club.tags.join(' · ') : '소개 준비중')}
        </p>
      </div>
    </Link>
  );
}
