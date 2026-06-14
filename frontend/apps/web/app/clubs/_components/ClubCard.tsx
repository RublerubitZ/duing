'use client';

import Link from 'next/link';

import { cn } from '@/app/_lib/cn';
import { ClubLogo } from '../../_components/ClubLogo';
import { toRoute } from '../../_lib/route';
import { CAT_COLORS, type Club } from '../_lib/clubs';

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.5-9.5-9.5C1 7 4.5 4 8 5c1.6.4 2.8 1.4 4 3 1.2-1.6 2.4-2.6 4-3 3.5-1 7 2 5.5 6.5C19.5 16.5 12 21 12 21z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

type Props = {
  club: Club;
  liked?: boolean;
  isLikeBusy?: boolean;
  onLikeToggle?: (id: number) => void;
  /** 리스트 첫 항목 추천 강조(잉크 보더 + 추천 라벨). */
  recommended?: boolean;
};

type Badge = { text: string; tone: 'recruiting' | 'urgent' | 'muted' };

// 모집 마감까지 D-day 뱃지. OPEN+endDate 만 카운트다운, 그 외엔 상태 라벨.
// 일 단위라 SSR/CSR 같은 날짜 → 하이드레이션 안전.
function recruitBadge(club: Club): Badge | null {
  const recruitment = club.activeRecruitment;
  if (recruitment === null) return null;
  switch (recruitment.displayStatus) {
    case 'ALWAYS_OPEN':
      return { text: '상시모집', tone: 'recruiting' };
    case 'UPCOMING':
      return { text: '모집예정', tone: 'recruiting' };
    case 'CLOSED':
      return { text: '모집마감', tone: 'muted' };
    case 'OPEN': {
      if (recruitment.endDate === null) return { text: '모집중', tone: 'recruiting' };
      const end = new Date(`${recruitment.endDate}T23:59:59`);
      const remainingDays = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
      if (remainingDays < 0) return { text: '모집마감', tone: 'muted' };
      if (remainingDays === 0) return { text: 'D-day', tone: 'urgent' };
      return { text: `D-${remainingDays}`, tone: remainingDays <= 3 ? 'urgent' : 'recruiting' };
    }
  }
}

const BADGE_TONE: Record<Badge['tone'], string> = {
  recruiting: 'bg-sage-mist text-ink-deep',
  urgent: 'bg-[#FCE2D9] text-[#9A3F23]',
  muted: 'bg-graysoft text-charcoal-3',
};

export function ClubCard({
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
        'group relative flex items-center gap-4 rounded-[18px] border bg-paper p-4 transition hover:shadow-2',
        recommended ? 'border-ink' : 'border-line',
        isDimmed && 'opacity-[0.85]',
      )}
    >
      {recommended && (
        <span className="absolute -top-2 left-5 rounded-full bg-ink px-2 py-[3px] text-[10px] font-bold tracking-wide04 text-paper">
          추천
        </span>
      )}

      <div
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[16px] font-display text-[28px] font-bold leading-none text-white shadow-1"
        style={{
          background: club.logoUrl
            ? undefined
            : `linear-gradient(135deg, ${club.color} 0%, ${club.color}CC 100%)`,
          letterSpacing: '-0.03em',
          filter: isDimmed ? 'saturate(0.6)' : undefined,
        }}
        aria-label={`${club.name} 로고`}
      >
        <ClubLogo logoUrl={club.logoUrl}>{initial}</ClubLogo>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[16px] font-bold leading-tight text-ink-deep">{club.name}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {badge && (
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', BADGE_TONE[badge.tone])}>
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
                'grid h-8 w-8 shrink-0 place-items-center rounded-full disabled:opacity-50',
                liked ? 'bg-[#FFE8E5] text-coral' : 'text-charcoal-3 hover:bg-graysoft',
              )}
            >
              <HeartIcon filled={liked} />
            </button>
          </div>
        </div>

        <p className="mt-0.5 truncate text-[13px] text-charcoal-3">{club.tag}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={cat.pill}>{club.cat}</span>
          {club.scope && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                club.scope === '중앙' ? 'bg-sage-mist text-ink-deep' : 'bg-graysoft text-charcoal-2',
              )}
            >
              {club.scope}
              {club.division ? ` · ${club.division}` : ''}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
