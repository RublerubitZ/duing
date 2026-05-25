'use client';

import Link from 'next/link';

import { SparkleFull } from '../../_components/Sparkle';
import { toRoute } from '../../_lib/route';
import { CAT_COLORS, type Club, type ClubStatus } from '../_lib/clubs';

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

type StatusStyle = {
  label: string;
  dotColor: string;
  chipClass: string;
};

const STATUS_STYLES: Record<ClubStatus, StatusStyle> = {
  open:     { label: '모집중',    dotColor: '#9DB6A0', chipClass: 'bg-sage-mist text-ink-deep' },
  upcoming: { label: '오픈 예정', dotColor: '#E8B968', chipClass: 'bg-[#FBEFD7] text-[#8E6620]' },
  closed:   { label: '모집 마감', dotColor: '#6F7574', chipClass: 'bg-graysoft text-charcoal-2' },
};

export function ClubCard({ club, size = 'md', liked = false, isLikeBusy = false, onLikeToggle }: Props) {
  const cat = CAT_COLORS[club.cat];
  const status = club.status;
  const s = STATUS_STYLES[status];
  const logoSize = size === 'lg' ? 96 : 64;
  const initial = (club.name || '?').trim().charAt(0);

  return (
    <Link
      href={toRoute(`/clubs/${club.id}`)}
      className={`relative flex flex-col gap-3.5 overflow-hidden bg-paper border border-line rounded-[18px] p-[18px] cursor-pointer transition hover:shadow-2 ${status === 'closed' ? 'opacity-[0.85]' : ''}`}
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
            filter: status === 'closed' ? 'saturate(0.6)' : undefined,
          }}
          aria-label={`${club.name} 로고`}
        >
          {club.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 동아리 로고는 외부 URL이며, 후속 PR에서 next/image 도메인 화이트리스트 + 사이즈 정책 결정 후 교체 예정
            <img
              src={club.logoUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            initial
          )}
          <SparkleFull size={12} color="#9DB6A0" className="absolute -top-1 -right-1" />
        </div>

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

      <div>
        <h3 className="text-[19px] mb-1.5 leading-[1.25]">{club.name}</h3>
        <p className="text-[13.5px] text-charcoal-3 leading-[1.45]">{club.tag}</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-charcoal-3">
        <span className={cat.pill}>{club.cat}</span>
        {club.scope && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide04 ${club.scope === '중앙' ? 'bg-sage-mist text-ink-deep' : 'bg-graysoft text-charcoal-2'}`}
          >
            {club.scope === '중앙' ? '🏛️ 중앙' : '🎓 학과'}
            {club.division ? ` · ${club.division}` : ''}
          </span>
        )}
        <span className="ml-auto font-mono text-[11.5px]">{club.gen}</span>
      </div>

      <div className="mt-1 pt-3 border-t border-dashed border-line flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11.5px] font-bold tracking-[0.02em] ${s.chipClass}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: s.dotColor,
              boxShadow: status === 'open' ? `0 0 0 3px ${s.dotColor}33` : undefined,
            }}
          />
          {s.label}
        </span>

        <span className="text-[12.5px] text-charcoal-2 inline-flex items-center gap-1.5">
          {status === 'open' && (
            <>
              <span className="text-charcoal-3">모집 {club.spots}</span>
              <span className="font-bold text-ink">~ {club.deadline}</span>
            </>
          )}
          {status === 'upcoming' && (
            <span className="font-bold text-[#8E6620]">
              {club.openDate ?? club.deadline} 오픈
            </span>
          )}
          {status === 'closed' && <span className="text-charcoal-3">다음 학기 예정</span>}
        </span>
      </div>
    </Link>
  );
}