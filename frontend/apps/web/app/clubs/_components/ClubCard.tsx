'use client';

import { Link } from 'next-view-transitions';

import { SparkleFull } from '../../_components/Sparkle';
import { ClubLogo } from '../../_components/ClubLogo';
import { toRoute } from '../../_lib/route';
import { ScopeChip } from './ScopeChip';
import { CAT_COLORS, formatDivisionLabel, type Club } from '../_lib/clubs';
import type { RecruitmentDisplayStatus } from '@duing/types';

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return filled ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.5-9.5-9.5C1 7 4.5 4 8 5c1.6.4 2.8 1.4 4 3 1.2-1.6 2.4-2.6 4-3 3.5-1 7 2 5.5 6.5C19.5 16.5 12 21 12 21z" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

type Props = {
  club: Club;
  size?: 'md' | 'lg';
  liked?: boolean;
  isLikeBusy?: boolean;
  onLikeToggle?: (id: number) => void;
};

type StatusKey = RecruitmentDisplayStatus | 'NONE';

type StatusStyle = {
  label: string;
  dotColor: string;
  chipClass: string;
};

const STATUS_STYLES: Record<StatusKey, StatusStyle> = {
  OPEN:        { label: '모집중',    dotColor: '#9DB6A0', chipClass: 'bg-sage-mist text-ink-deep' },
  ALWAYS_OPEN: { label: '상시모집',  dotColor: '#9DB6A0', chipClass: 'bg-sage-mist text-ink-deep' },
  UPCOMING:    { label: '모집예정',  dotColor: '#E8B968', chipClass: 'bg-[#FBEFD7] text-[#8E6620]' },
  CLOSED:      { label: '모집마감',  dotColor: '#6F7574', chipClass: 'bg-graysoft text-charcoal-2' },
  NONE:        { label: '모집 없음', dotColor: '#6F7574', chipClass: 'bg-graysoft text-charcoal-2' },
};

function formatMonthDay(isoDate: string): string {
  const parts = isoDate.split('-');
  const month = parts[1] ?? '';
  const day = parts[2] ?? '';
  return `${month}.${day}`;
}

function renderPeriod(club: Club): React.ReactNode {
  const recruitment = club.activeRecruitment;
  if (recruitment === null) {
    return null;
  }
  switch (recruitment.displayStatus) {
    case 'OPEN':
      if (recruitment.endDate === null) return null;
      return (
        <span className="font-bold text-ink">
          모집 {formatMonthDay(recruitment.startDate)} - {formatMonthDay(recruitment.endDate)}
        </span>
      );
    case 'ALWAYS_OPEN':
      return <span className="font-bold text-ink">상시모집</span>;
    case 'UPCOMING':
      return (
        <span className="font-bold text-[#8E6620]">
          {formatMonthDay(recruitment.startDate)}부터 모집
        </span>
      );
    case 'CLOSED':
      return <span className="text-charcoal-3">모집 종료</span>;
  }
}

export function ClubCard({ club, size = 'md', liked = false, isLikeBusy = false, onLikeToggle }: Props) {
  const cat = CAT_COLORS[club.cat];
  const statusKey: StatusKey = club.activeRecruitment?.displayStatus ?? 'NONE';
  const statusStyle = STATUS_STYLES[statusKey];
  const isDimmed = statusKey === 'CLOSED' || statusKey === 'NONE';
  const logoSize = size === 'lg' ? 96 : 64;
  const initial = (club.name || '?').trim().charAt(0);

  return (
    <Link
      href={toRoute(`/clubs/${club.id}`)}
      className={`relative flex flex-col gap-3.5 overflow-hidden bg-paper border border-line rounded-[18px] p-[18px] cursor-pointer transition hover:shadow-2 ${isDimmed ? 'opacity-[0.85]' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`relative grid place-items-center shrink-0 text-white font-display font-bold leading-none shadow-1 overflow-hidden ${size === 'lg' ? 'rounded-[22px]' : 'rounded-[16px]'}`}
          style={{
            width: logoSize,
            height: logoSize,
            background: club.logoUrl
              ? undefined
              : `linear-gradient(135deg, ${club.color} 0%, ${club.color}CC 100%)`,
            fontSize: size === 'lg' ? 44 : 30,
            letterSpacing: '-0.03em',
            filter: isDimmed ? 'saturate(0.6)' : undefined,
            // 공유요소 전환 — 상세 히어로의 같은 이름 로고로 모핑된다(clubs 목록 → 상세).
            viewTransitionName: `club-logo-${club.id}`,
          }}
          aria-label={`${club.name} 로고`}
        >
          <ClubLogo logoUrl={club.logoUrl}>{initial}</ClubLogo>
          <SparkleFull size={12} color="#9DB6A0" className="absolute -top-1 -right-1" />
        </div>

        {/* 계층 2 — 소속은 우측 상단 속성 자리(이름과 경쟁 금지), 하트는 그 옆 코너 액션. */}
        <div className="flex items-center gap-1 shrink-0">
          <ScopeChip scope={club.scope} />
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
            className={`grid place-items-center w-8 h-8 rounded-full shrink-0 disabled:opacity-50 ${liked ? 'bg-[#FFE8E5] text-coral' : 'bg-transparent text-charcoal-3'}`}
          >
            <HeartIcon filled={liked} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          {/* 계층 1·2 — 이름 + 한줄 소개(1줄 말줄임). 미작성이면 문구 없이 빈 줄로 높이만 유지해
              모든 카드에서 카테고리 행 위치가 일정하게 정렬되도록 한다(NBSP가 줄 높이 확보). */}
          <h3 className="text-[20px] leading-[1.25]">{club.name}</h3>
          <p className="truncate text-[14px] text-charcoal-2 leading-[1.5]">
            {club.tagline ?? ' '}
          </p>
        </div>
        {/* 계층 3·4 — 카테고리는 pill 없이 카테고리별 색상 텍스트로, 분과는 회색 보조 텍스트(중앙만). */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[13px] font-semibold ${cat.text}`}>{club.cat}</span>
          {club.scope === '중앙' && club.division && (
            <span className="text-[13px] text-charcoal-3">{formatDivisionLabel(club.division)}</span>
          )}
        </div>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[12px] font-bold tracking-[0.02em] ${statusStyle.chipClass}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: statusStyle.dotColor,
              boxShadow: statusKey === 'OPEN' || statusKey === 'ALWAYS_OPEN'
                ? `0 0 0 3px ${statusStyle.dotColor}33`
                : undefined,
            }}
          />
          {statusStyle.label}
        </span>

        <span className="text-[13px] text-charcoal-2 inline-flex items-center gap-1.5">
          {renderPeriod(club)}
        </span>
      </div>
    </Link>
  );
}