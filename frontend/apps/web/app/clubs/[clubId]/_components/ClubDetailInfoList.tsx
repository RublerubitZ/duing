import type { ClubDetail } from '@duing/types';

type Props = { club: ClubDetail };

type Row = { label: string; value: string };

export function ClubDetailInfoList({ club }: Props) {
  const rows: Row[] = [];
  if (club.foundedYear !== null) rows.push({ label: '창설년도', value: `${club.foundedYear}년` });
  if (club.cohortNumber !== null) rows.push({ label: '현재 기수', value: `${club.cohortNumber}기` });
  if (club.membershipFee !== null) rows.push({ label: '회비', value: club.membershipFee });
  if (club.location !== null) rows.push({ label: '위치', value: club.location });
  if (club.contactEmail !== null) rows.push({ label: '연락처', value: club.contactEmail });

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
