import type { ClubDetail } from '@duing/types';

import { formatClubFee } from '../../../_lib/clubFee';

type Props = { club: ClubDetail };

type Row = { label: string; value: string };

export function ClubDetailInfoList({ club }: Props) {
  const rows: Row[] = [];
  if (club.leaderName !== null) rows.push({ label: '동아리 회장', value: club.leaderName });
  if (club.foundedYear !== null) rows.push({ label: '창설년도', value: `${club.foundedYear}년` });
  if (club.cohortNumber !== null) rows.push({ label: '현재 기수', value: `${club.cohortNumber}기` });
  const feeText = formatClubFee(club.feeCycle, club.membershipFeeAmount);
  if (feeText !== null) rows.push({ label: '회비', value: feeText });
  if (club.location !== null) rows.push({ label: '위치', value: club.location });
  // 대표 연락처 — 정책 상태를 명시적으로 안내 (§8). PUBLIC+null(회장 미등록)은 숨김(fail-safe).
  if (club.contactPhone !== null) {
    rows.push({ label: '대표 연락처', value: club.contactPhone });
  } else if (club.contactVisibility === 'LOGGED_IN_ONLY') {
    rows.push({ label: '대표 연락처', value: '로그인 후 확인 가능' });
  } else if (club.contactVisibility === 'PRIVATE') {
    rows.push({ label: '대표 연락처', value: '대표 연락처 비공개' });
  }

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-[15px]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-charcoal-3">{row.label}</dt>
          <dd className="text-charcoal">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
