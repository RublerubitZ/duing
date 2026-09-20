'use client';

import { useParams } from 'next/navigation';
import { useClubDetailQuery } from '@duing/hooks';
import { MemberPageHeader } from '../../_components/MemberPageHeader';
import { ClubEventList } from '../../_components/ClubEventList';

type Props = { clubId: number };

export function ClubMemberEventsPage() {
  const params = useParams<{ clubId: string }>();
  const clubId = params.clubId ? Number(params.clubId) : null;
  if (clubId === null) return null;

  return <ClubMemberEvents clubId={clubId} />;
}

function ClubMemberEvents({ clubId }: Props) {
  const { data: club } = useClubDetailQuery(clubId);

  return (
    <>
      <MemberPageHeader clubId={clubId} clubName={club?.name ?? '동아리'} />
      <ClubEventList clubId={clubId} />
    </>
  );
}
