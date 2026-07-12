'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { MyClubSummary } from '@duing/types';

import { isKnownNonActiveClubStatus } from '../_lib/clubStatusGuard';

const ACK_KEY_PREFIX = 'duing.acceptedAck.';
const ACK_WINDOW_DAYS = 30;

type Props = {
  myClubs: MyClubSummary[];
};

function pickBannerCandidate(clubs: MyClubSummary[], now: Date): MyClubSummary | null {
  if (clubs.length === 0) return null;
  const cutoffMs = now.getTime() - ACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const candidate = [...clubs]
    .filter(
      (club) =>
        !isKnownNonActiveClubStatus(club.status) &&
        new Date(club.joinedAt).getTime() >= cutoffMs,
    )
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())[0];

  if (!candidate) return null;
  if (typeof window === 'undefined') return null;
  if (window.localStorage.getItem(ACK_KEY_PREFIX + candidate.clubId)) return null;
  return candidate;
}

export function AcceptanceBanner({ myClubs }: Props) {
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  const candidate = useMemo(
    () => pickBannerCandidate(myClubs, new Date()),
    [myClubs],
  );

  if (!candidate || candidate.clubId === dismissedId) return null;

  const ack = () => {
    try {
      window.localStorage.setItem(ACK_KEY_PREFIX + candidate.clubId, String(Date.now()));
    } catch {
      /* localStorage 차단 환경 — 세션 동안만 닫힘 */
    }
    setDismissedId(candidate.clubId);
  };

  return (
    <div
      role="status"
      className="max-w-layout mx-auto mt-4 mb-2 px-4 sm:px-6 md:px-10"
    >
      <div className="flex items-center gap-3 rounded-[14px] border border-ink bg-ink/[0.04] px-5 py-3">
        <span className="text-[18px]">🎉</span>
        <div className="flex-1 text-[14px] text-ink-deep">
          <b>{candidate.clubName}</b> 동아리에 합류했어요!
        </div>
        <Link
          href={`/clubs/${candidate.clubId}`}
          onClick={ack}
          className="btn btn-primary btn-sm"
        >
          둘러보기
        </Link>
        <button
          type="button"
          onClick={ack}
          className="btn btn-ghost btn-sm"
          aria-label="합격 배너 닫기"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
