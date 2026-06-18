'use client';

import { useParams } from 'next/navigation';

import { useClubFeeReceiptQuery } from '@duing/hooks';

import { FeeReceiptScreen } from '@/app/_components/fee/FeeReceiptScreen';

export default function LeaderReceiptPage() {
  const params = useParams<{ clubId: string; billId: string }>();
  const clubId = Number(params.clubId);
  const billId = Number(params.billId);
  const { data: receipt, isLoading, isError } = useClubFeeReceiptQuery(clubId, billId);

  return (
    <FeeReceiptScreen
      receipt={receipt}
      isLoading={isLoading}
      isError={isError || Number.isNaN(clubId) || Number.isNaN(billId)}
      backHref={`/manage/clubs/${clubId}/fees`}
    />
  );
}
