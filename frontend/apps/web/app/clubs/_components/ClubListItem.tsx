'use client';

// 모바일 전용 가로형 리스트 카드(media-object) — 데스크탑은 세로형 ClubCard 를 쓴다(ClubExplorePage 에서 분기).
// 리딩 모노그램 + 이름/태그 + 카테고리·소속 칩 + 우측(상단 D-day · 하단 찜). 첫 항목은 추천 강조(잉크 보더).

import { Link } from 'next-view-transitions';

import { cn } from '@/app/_lib/cn';
import { Sparkle, SparkleFull } from '../../_components/Sparkle';
import { ClubLogo } from '../../_components/ClubLogo';
import { toRoute } from '../../_lib/route';
import { ScopeChip } from './ScopeChip';
import { CAT_COLORS, formatDivisionLabel, type Club } from '../_lib/clubs';

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return filled ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.5-9.5-9.5C1 7 4.5 4 8 5c1.6.4 2.8 1.4 4 3 1.2-1.6 2.4-2.6 4-3 3.5-1 7 2 5.5 6.5C19.5 16.5 12 21 12 21z" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

type Badge = { text: string; tone: 'recruiting' | 'urgent' | 'muted' };

// 모집 마감까지 D-day. OPEN+endDate 만 카운트다운, 그 외엔 상태 라벨. 일 단위라 SSR/CSR 같은 날짜 → 안전.
function recruitBadge(club: Club): Badge | null {
  const recruitment = club.activeRecruitment;
  if (recruitment === null) return null;
  switch (recruitment.displayStatus) {
    case 'ALWAYS_OPEN':
      return { text: '상시', tone: 'recruiting' };
    case 'UPCOMING':
      return { text: '예정', tone: 'recruiting' };
    case 'CLOSED':
      return { text: '마감', tone: 'muted' };
    case 'OPEN': {
      if (recruitment.endDate === null) return { text: '모집중', tone: 'recruiting' };
      const end = new Date(`${recruitment.endDate}T23:59:59`);
      const remainingDays = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
      if (remainingDays < 0) return { text: '마감', tone: 'muted' };
      if (remainingDays === 0) return { text: 'D-day', tone: 'urgent' };
      return { text: `D-${remainingDays}`, tone: remainingDays <= 3 ? 'urgent' : 'recruiting' };
    }
  }
}

const BADGE_TONE: Record<Badge['tone'], string> = {
  recruiting: 'bg-ink text-white',
  urgent: 'bg-coral text-white',
  muted: 'bg-graysoft text-charcoal-3',
};

type Props = {
  club: Club;
  liked?: boolean;
  isLikeBusy?: boolean;
  onLikeToggle?: (id: number) => void;
  /** 리스트 첫 항목 추천 강조(잉크 보더 + 추천 라벨). */
  recommended?: boolean;
};

export function ClubListItem({
  club,
  liked = false,
  isLikeBusy = false,
  onLikeToggle,
  recommended = false,
}: Props) {
  const cat = CAT_COLORS[club.cat];
  const badge = recruitBadge(club);
  const isDimmed = badge?.tone === 'muted' || club.activeRecruitment === null;
  const initial = (club.name || '?').trim().charAt(0);

  return (
    <Link
      href={toRoute(`/clubs/${club.id}`)}
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl bg-paper p-3.5 transition hover:shadow-2',
        recommended ? 'border-[1.5px] border-ink' : 'border border-line',
        isDimmed && 'opacity-[0.78]',
      )}
    >
      {recommended && (
        <span className="absolute -top-2 left-3.5 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-[2px] text-[10px] font-bold text-white">
          <Sparkle size={9} color="#9DB6A0" />
          추천
        </span>
      )}

      <div
        className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl font-display text-[23px] font-bold leading-none text-white shadow-1"
        style={{
          background: club.logoUrl
            ? undefined
            : `linear-gradient(135deg, ${club.color} 0%, ${club.color}CC 100%)`,
          letterSpacing: '-0.03em',
          filter: isDimmed ? 'saturate(0.6)' : undefined,
          // 공유요소 전환 — 모바일 목록 로고에서 상세 히어로로 모핑(데스크탑 ClubCard 와 동일 규칙).
          viewTransitionName: `club-logo-${club.id}`,
        }}
        aria-label={`${club.name} 로고`}
      >
        <ClubLogo logoUrl={club.logoUrl}>{initial}</ClubLogo>
        <SparkleFull size={11} color="rgba(255,255,255,0.9)" className="absolute -right-[3px] -top-[3px]" />
      </div>

      <div className="min-w-0 flex-1">
        {/* 계층 1·2 — 이름 + 한줄 소개(각 1줄 truncate). */}
        <div className="truncate text-[15.5px] font-bold leading-tight text-ink-deep">{club.name}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-charcoal-2">{club.tagline}</div>
        {/* 계층 3·4 — 카테고리 색상 pill 우선, 소속 칩·분과(회색, 중앙만)가 뒤따른다.
            우측 상단은 D-day(모집) 자리라 소속 칩은 이 행에서 계층 순서를 표현. */}
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
          <span className={cn(cat.pill, 'shrink-0 text-[10px]')}>{club.cat}</span>
          <ScopeChip scope={club.scope} />
          {club.scope === '중앙' && club.division && (
            <span className="min-w-0 truncate text-[11px] text-charcoal-3">
              {formatDivisionLabel(club.division)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
        {badge && (
          <span className={cn('rounded-full px-2.5 py-1 font-mono text-[11px] font-extrabold', BADGE_TONE[badge.tone])}>
            {badge.text}
          </span>
        )}
        <button
          type="button"
          aria-label={liked ? '찜 해제' : '찜 추가'}
          aria-pressed={liked}
          disabled={isLikeBusy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onLikeToggle?.(club.id);
          }}
          className={cn(
            'grid h-[30px] w-[30px] place-items-center rounded-full disabled:opacity-50',
            liked ? 'text-coral' : 'text-charcoal-3',
          )}
        >
          <HeartIcon filled={liked} />
        </button>
      </div>
    </Link>
  );
}
