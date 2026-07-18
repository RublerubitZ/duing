'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminReportDetailQuery, useProcessReportMutation } from '@duing/hooks';
import type { ProcessReportPayload } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { AdminReportProcessDialog } from '../_components/AdminReportProcessDialog';
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_BADGE_CLASS,
  REPORT_TARGET_TYPE_LABEL,
  REPORT_REASON_LABEL,
} from '../_lib/reportLabels';

type Props = {
  reportId: number;
};

export function AdminReportDetailPage({ reportId }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const detailQuery = useAdminReportDetailQuery(reportId);
  const processMutation = useProcessReportMutation();

  const report = detailQuery.data;

  const handleProcessConfirm = (payload: ProcessReportPayload) => {
    setMutationError(null);
    processMutation.mutate(
      { reportId, payload },
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
        <LoadingGate label="신고 불러오는 중" />
      </main>
    );
  }

  if (detailQuery.isError || !report) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-coral text-[13px]">신고 정보를 불러오지 못했습니다.</p>
      </main>
    );
  }

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/reports"
          className="text-[13px] text-charcoal-2 hover:text-ink"
        >
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">신고 상세</h1>
      </header>

      <div className="rounded-xl border border-line bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-charcoal-2">신고 #{report.id}</span>
          <span
            className={cn(
              'inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold',
              REPORT_STATUS_BADGE_CLASS[report.status],
            )}
          >
            {REPORT_STATUS_LABEL[report.status]}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px]">
          <Row label="신고자">
            {report.reporter ? `${report.reporter.name} (ID: ${report.reporter.id})` : '(알 수 없음)'}
          </Row>
          <Row label="신고 일시">
            {new Date(report.createdAt).toLocaleString('ko-KR')}
          </Row>
          <Row label="대상 타입">
            {REPORT_TARGET_TYPE_LABEL[report.targetType]}
          </Row>
          <Row label="대상명">
            {report.targetLabel}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {report.targetId})</span>
          </Row>
          <Row label="신고 사유">
            {REPORT_REASON_LABEL[report.reasonCode]}
          </Row>
        </dl>

        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">사유 본문</dt>
          <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
            {report.detail || '(내용 없음)'}
          </dd>
        </div>

        {(report.handledBy || report.actionNote) && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px] border-t border-line pt-5">
            {report.handledBy && (
              <Row label="처리자">
                {report.handledBy.name} (ID: {report.handledBy.id})
              </Row>
            )}
            {report.handledAt && (
              <Row label="처리 일시">
                {new Date(report.handledAt).toLocaleString('ko-KR')}
              </Row>
            )}
            {report.actionNote && (
              <div className="sm:col-span-2">
                <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">처리 메모</dt>
                <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
                  {report.actionNote}
                </dd>
              </div>
            )}
          </dl>
        )}

        {report.status === 'PENDING' && (
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
        <AdminReportProcessDialog
          report={report}
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
