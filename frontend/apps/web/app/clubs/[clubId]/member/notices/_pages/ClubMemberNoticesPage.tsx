'use client';

import { useParams } from 'next/navigation';
import { useClubDetailQuery } from '@duing/hooks';
import { MemberPageHeader } from '../../_components/MemberPageHeader';
import { ClubNoticeList } from '../../_components/ClubNoticeList';

type Props = { clubId: number };

export function ClubMemberNoticesPage() {
  const params = useParams<{ clubId: string }>();
  const clubId = params.clubId ? Number(params.clubId) : null;
  if (clubId === null) return null;

  return <ClubMemberNotices clubId={clubId} />;
}

function ClubMemberNotices({ clubId }: Props) {
  const { data: club } = useClubDetailQuery(clubId);

  return (
    <>
      <MemberPageHeader clubId={clubId} clubName={club?.name ?? '동아리'} />
      <ClubNoticeList clubId={clubId} />
    </>
  );
}
