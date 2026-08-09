import type { ClubDetail } from '@duing/types';

import { collegeDisplayName } from '../../../_lib/college';
import { formatClubFee } from '../../../_lib/clubFee';

type Props = { club: ClubDetail };

type Row = { label: string; value: string | null; note?: string | null };

export function ClubDetailInfoList({ club }: Props) {
  const rows: Row[] = [];
  // 소속 정보는 단과대 동아리에만 해당 — 값이 없는 행은 아예 만들지 않는다(placeholder 금지).
  // department 는 배포 전환기(구 백엔드 응답)에 아예 없을 수 있어 != null 로 undefined 까지 걸러낸다.
  if (!club.centralClub) {
    if (club.college != null) rows.push({ label: '단과대', value: collegeDisplayName(club.college) });
    if (club.department != null) rows.push({ label: '학과', value: club.department });
  }
  if (club.leaderName !== null) rows.push({ label: '동아리 회장', value: club.leaderName });
  if (club.foundedYear !== null) rows.push({ label: '창설년도', value: `${club.foundedYear}년` });
  if (club.cohortNumber !== null) rows.push({ label: '현재 기수', value: `${club.cohortNumber}기` });
  const feeText = formatClubFee(club.feeCycle, club.membershipFeeAmount);
  // 대표 금액이 없어도 안내문이 있으면 회비 항목을 노출한다 (스펙 결정 사항)
  if (feeText !== null || club.feeNote !== null) {
    rows.push({ label: '회비', value: feeText, note: club.feeNote });
  }
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
          <dd className="text-charcoal">
            {row.value}
            {row.note != null && (
              <p
                className={`${row.value !== null ? 'mt-1 ' : ''}whitespace-pre-wrap break-words text-[13px] leading-relaxed text-charcoal-3`}
              >
                {row.note}
              </p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
