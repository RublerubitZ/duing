'use client';

import Link from 'next/link';
import type { FavoriteClub } from '@duing/types';
import { FavoriteToggleButton } from '../../../_components/FavoriteToggleButton';
import { ClubLogo } from '../../../_components/ClubLogo';

const CATEGORY_LABEL: Record<FavoriteClub['category'], string> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '종교',
  HOBBY: '취미',
  OTHER: '기타',
};

type Props = { favorite: FavoriteClub };

export function FavoriteClubCard({ favorite }: Props) {
  return (
    <li className="relative">
      <Link
        href={`/clubs/${favorite.clubId}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
      >
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
          <ClubLogo logoUrl={favorite.logoUrl} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{favorite.name}</p>
          <p className="text-xs text-slate-500">
            {CATEGORY_LABEL[favorite.category]}
            {favorite.division ? ` · ${favorite.division}` : ''}
          </p>
          {/* 0건도 표기한다 — 배지가 아예 없으면 "모집 없음"과 "아직 안 불러옴"이 구분되지 않는다.
              문구는 /me 홈의 찜 섹션(SectionSaved)과 같은 말을 쓴다. */}
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              favorite.openRecruitmentCount > 0
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {favorite.openRecruitmentCount > 0
              ? `모집중 ${favorite.openRecruitmentCount}건`
              : '모집 없음'}
          </span>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <FavoriteToggleButton clubId={favorite.clubId} size="sm" />
      </div>
    </li>
  );
}