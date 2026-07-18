'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminSuccessionDetailQuery, useProcessSuccessionMutation } from '@duing/hooks';
import type { ProcessSuccessionPayload } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { AdminSuccessionProcessDialog } from '../_components/AdminSuccessionProcessDialog';
import {
  SUCCESSION_STATUS_LABEL,
  SUCCESSION_STATUS_BADGE_CLASS,
} from '../_lib/successionLabels';

type Props = {
  requestId: number;
};

export function AdminSuccessionDetailPage({ requestId }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const detailQuery = useAdminSuccessionDetailQuery(requestId);
  const processMutation = useProcessSuccessionMutation();

  const succession = detailQuery.data;

  const handleProcessConfirm = (payload: ProcessSuccessionPayload) => {
    setMutationError(null);
    processMutation.mutate(
      { requestId, payload },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
        },
        onError: (error) => {
          setMutationError(error instanceof Error ? error.message : '처리에 실패했습니다.');
        },
      },
    );
  };

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <LoadingGate label="승계 요청 불러오는 중" />
      </main>
    );
  }

  if (detailQuery.isError || !succession) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-coral text-[13px]">
          승계 요청 정보를 불러오지 못했습니다.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/admin/leader-succession" className="text-[13px] text-charcoal-2 hover:text-ink">
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">승계 요청 상세</h1>
      </header>

      <div className="rounded-xl border border-line bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-charcoal-2">요청 #{succession.id}</span>
          <span
            className={cn(
              'inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold',
              SUCCESSION_STATUS_BADGE_CLASS[succession.status],
            )}
          >
            {SUCCESSION_STATUS_LABEL[succession.status]}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px]">
          <Row label="동아리">
            {succession.club.name}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {succession.club.id})</span>
          </Row>
          <Row label="요청 일시">
            {new Date(succession.createdAt).toLocaleString('ko-KR')}
          </Row>
          <Row label="요청자">
            {succession.requester
              ? `${succession.requester.name} (ID: ${succession.requester.id})`
              : '(알 수 없음)'}
          </Row>
          <Row label="현재 회장">
            {succession.currentLeader
              ? `${succession.currentLeader.name} (ID: ${succession.currentLeader.id})`
              : '(없음)'}
          </Row>
        </dl>

        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">요청 사유</dt>
          <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
            {succession.reason || '(내용 없음)'}
          </dd>
        </div>

        {(succession.handledBy || succession.actionNote) && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px] border-t border-line pt-5">
            {succession.handledBy && (
              <Row label="처리자">
                {succession.handledBy.name} (ID: {succession.handledBy.id})
              </Row>
            )}
            {succession.handledAt && (
              <Row label="처리 일시">
                {new Date(succession.handledAt).toLocaleString('ko-KR')}
              </Row>
            )}
            {succession.actionNote && (
              <div className="sm:col-span-2">
                <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">처리 메모</dt>
                <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
                  {succession.actionNote}
                </dd>
              </div>
            )}
          </dl>
        )}

        {succession.status === 'PENDING' && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
            >
              처리
            </button>
          </div>
        )}
      </div>

      {isDialogOpen && (
        <AdminSuccessionProcessDialog
          succession={succession}
          isPending={processMutation.isPending}
          errorMessage={mutationError}
          onConfirm={handleProcessConfirm}
          onCancel={() => {
            setIsDialogOpen(false);
            setMutationError(null);
          }}
        />
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-charcoal-2">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
