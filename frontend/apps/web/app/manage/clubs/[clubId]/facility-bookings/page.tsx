'use client';

import { use } from 'react';
import { FacilityBookingsView } from './_components/FacilityBookingsView';

export default function FacilityBookingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  return <FacilityBookingsView clubId={Number.isInteger(clubId) && clubId > 0 ? clubId : Number.NaN} />;
}
