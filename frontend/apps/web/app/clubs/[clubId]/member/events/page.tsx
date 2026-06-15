'use client';

import { use } from 'react';
import { useClubDetailQuery } from '@duing/hooks';
import { MemberPageHeader } from '../_components/MemberPageHeader';
import { ClubEventList } from '../_components/ClubEventList';

export default function ClubMemberEventsPage({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const { data: club } = useClubDetailQuery(clubId);

  return (
    <>
      <MemberPageHeader clubId={clubId} clubName={club?.name ?? '동아리'} />
      <ClubEventList clubId={clubId} />
    </>
  );
}
