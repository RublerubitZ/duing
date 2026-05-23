'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useAdminRecertificationRequestDetailQuery,
  useProcessRecertificationMutation,
} from '@duing/hooks';
import type { ProcessRecertificationPayload } from '@duing/types';
import { cn } from '../../../../_lib/cn';
import { AdminRecertificationRequestProcessDialog } from '../_components/AdminRecertificationRequestProcessDialog';
import { AdminRecertificationMemberHistorySection } from '../_components/AdminRecertificationMemberHistorySection';
import {
  RECERTIFICATION_STATUS_LABEL,
  RECERTIFICATION_STATUS_BADGE_CLASS,
} from '../_lib/recertificationRequestLabels';

type Props = {
  requestId: number;
};

export function AdminRecertificationRequestDetailPage({ requestId }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const detailQuery = useAdminRecertificationRequestDetailQuery(requestId);
  const processMutation = useProcessRecertificationMutation();

  const request = detailQuery.data;

  const handleProcessConfirm = (payload: ProcessRecertificationPayload) => {
    setMutationError(null);
    processMutation.mutate(
      { requestId, payload },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
        },
        onError: (error) => {
          setMutationError(
            error instanceof Error ? error.message : '처리에 실패했습니다.',
          );
        },
      },
    );
  };

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-layout mx-auto px-10 py-10">
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <main className="max-w-layout mx-auto px-10 py-10">
        <p className="py-12 text-center text-coral text-[13px]">
          재인증 요청 정보를 불러오지 못했습니다.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/recertification/requests"
          className="text-[13px] text-charcoal-2 hover:text-ink"
        >
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">재인증 요청 상세</h1>
      </header>

      <div className="rounded-xl border border-line bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-charcoal-2">요청 #{request.id}</span>
          <span
            className={cn(
              'inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold',
              RECERTIFICATION_STATUS_BADGE_CLASS[request.status],
            )}
          >
            {RECERTIFICATION_STATUS_LABEL[request.status]}
          </span>
        </div>

        {/* 기본 정보 */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px]">
          <Row label="라운드">
            {request.round.year}년 {request.round.label}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {request.round.id})</span>
          </Row>
          <Row label="운영연도">{request.operatingYear}년</Row>
          <Row label="동아리">
            {request.club.name}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {request.club.id})</span>
            {request.club.lastVerifiedYear !== null && (
              <span className="ml-1 text-charcoal-3 text-[12px]">
                · 최근 인증: {request.club.lastVerifiedYear}년
              </span>
            )}
          </Row>
          <Row label="요청 일시">
            {new Date(request.createdAt).toLocaleString('ko-KR')}
          </Row>
          <Row label="제출 회장">
            {request.submittedLeader.name}
            <span className="ml-1 text-charcoal-3 text-[12px]">
              (ID: {request.submittedLeader.id})
            </span>
          </Row>
          <Row label="현재 회장">
            {request.currentLeader
              ? `${request.currentLeader.name} (ID: ${request.currentLeader.id})`
              : '(없음)'}
          </Row>
          <Row label="연락처 이메일">{request.contactEmail}</Row>
          <Row label="연락처 전화">{request.contactPhone}</Row>
        </dl>

        {/* 임원 목록 */}
        {request.officers.length > 0 && (
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">임원</dt>
            <dd className="flex flex-wrap gap-2">
              {request.officers.map((officer) => (
                <span
                  key={officer.id}
                  className="inline-block px-2.5 py-1 rounded-full bg-graysoft text-[12px] text-charcoal-2"
                >
                  {officer.name} (ID: {officer.id})
                </span>
              ))}
            </dd>
          </div>
        )}

        {/* 기타 메모 */}
        {request.notes && (
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">요청 메모</dt>
            <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
              {request.notes}
            </dd>
          </div>
        )}

        {/* 처리 이력 */}
        {(request.handledBy || request.actionNote) && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px] border-t border-line pt-5">
            {request.handledBy && (
              <Row label="처리자">
                {request.handledBy.name} (ID: {request.handledBy.id})
              </Row>
            )}
            {request.handledAt && (
              <Row label="처리 일시">
                {new Date(request.handledAt).toLocaleString('ko-KR')}
              </Row>
            )}
            {request.actionNote && (
              <div className="sm:col-span-2">
                <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">처리 메모</dt>
                <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
                  {request.actionNote}
                </dd>
              </div>
            )}
          </dl>
        )}

        {request.status === 'PENDING' && (
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

      {/* 최근 회원 이력 */}
      <section className="mt-8">
        <h2 className="text-[16px] font-bold text-ink mb-3">최근 회원 이력</h2>
        <AdminRecertificationMemberHistorySection rows={request.recentMemberHistory} />
      </section>

      {isDialogOpen && (
        <AdminRecertificationRequestProcessDialog
          request={request}
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
