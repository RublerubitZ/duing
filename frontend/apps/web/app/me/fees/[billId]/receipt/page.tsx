'use client';

import { useParams } from 'next/navigation';

import { useMyFeeReceiptQuery } from '@duing/hooks';

import { FeeReceiptScreen } from '@/app/_components/fee/FeeReceiptScreen';

export default function MemberReceiptPage() {
  const params = useParams<{ billId: string }>();
  const billId = Number(params.billId);
  const { data: receipt, isLoading, isError } = useMyFeeReceiptQuery(billId);

  return (
    <FeeReceiptScreen
      receipt={receipt}
      isLoading={isLoading}
      isError={isError || Number.isNaN(billId)}
      backHref="/me/fees"
    />
  );
}
