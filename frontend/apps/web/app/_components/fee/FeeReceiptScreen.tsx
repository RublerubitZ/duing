'use client';

import Link from 'next/link';

import type { Receipt } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';

import { FeeReceiptDocument } from './FeeReceiptDocument';

type FeeReceiptScreenProps = {
  receipt: Receipt | undefined;
  isLoading: boolean;
  isError: boolean;
  backHref: `/${string}`;
};

export function FeeReceiptScreen({ receipt, isLoading, isError, backHref }: FeeReceiptScreenProps) {
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <TextLinesSkeleton lines={6} label="영수증 불러오는 중" />
      </div>
    );
  }

  // 발급 불가(납부 0건/취소/타인)는 404 → ApiError 로 surface 되어 receipt 가 비어 있다.
  if (isError || !receipt) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-charcoal-2">
          영수증을 불러올 수 없어요. 납부 내역이 있는 청구만 영수증을 발급할 수 있습니다.
        </p>
        <Link
          href={toRoute(backHref)}
          className="mt-3 inline-block text-sm font-semibold text-ink underline"
        >
          돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={toRoute(backHref)} className="text-sm font-semibold text-charcoal-2 hover:text-ink">
          ← 돌아가기
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep"
        >
          인쇄 / PDF 저장
        </button>
      </div>
      <FeeReceiptDocument receipt={receipt} />
    </div>
  );
}
