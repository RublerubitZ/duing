'use client';

import { useAdminApplicationDetailQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminApplicationDetail } from '@duing/types';

import { APPLICATION_STATUS_LABEL } from '@/app/_constants/application-status';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { ErrorState } from '../../_components/ErrorState';
import { APPLICATION_STATUS_BADGE_CLASS, collegeMajorLabel } from '../_lib/recruitmentLabels';

/**
 * 지원서 열람 본문 — 총동연은 심사 주체가 아니므로 상태를 바꾸거나 메모를 남길 수단을 두지 않는다.
 * 응답에 연락처·학년·평가·면접이 없는 것과 같은 이유다.
 */
export function AdminApplicationSheetContent({ detail }: { detail: AdminApplicationDetail }) {
  const { applicant } = detail;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line pb-4 pr-8">
        {/* 어느 동아리의 어느 모집인지 먼저 보여준다 — 지원서만 보면 맥락을 잃는다. */}
        <p className="text-[12px] font-semibold text-charcoal-2">{detail.clubName}</p>
        <p className="mt-0.5 break-keep text-[15.5px] font-bold text-ink-deep">
          {detail.recruitmentTitle}
        </p>
        <span
          className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
            APPLICATION_STATUS_BADGE_CLASS[detail.status]
          }`}
        >
          {APPLICATION_STATUS_LABEL[detail.status]}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SectionLabel>지원자 · 조회 전용</SectionLabel>
        <dl className="grid grid-cols-2 gap-2">
          <Field label="이름">{applicant.name}</Field>
          <Field label="학번">{applicant.studentId}</Field>
          <Field label="학부 · 학과" span2>
            {collegeMajorLabel(applicant.college, applicant.major)}
          </Field>
          <Field label="지원일" span2>
            {formatDateTimeKst(detail.submittedAt)}
          </Field>
        </dl>

        <SectionLabel className="mt-6">상태 변경 이력</SectionLabel>
        {detail.statusHistory.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">상태 변경 이력이 없습니다</p>
        ) : (
          <ul aria-label="상태 변경 이력" className="flex flex-col">
            {detail.statusHistory.map((entry, index) => (
              <li key={`${entry.changedAt}-${index}`} className="flex gap-3">
                <div aria-hidden className="flex flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage" />
                  {index < detail.statusHistory.length - 1 && (
                    <span className="w-0.5 flex-1 bg-line" />
                  )}
                </div>
                <div className={index < detail.statusHistory.length - 1 ? 'pb-3' : ''}>
                  <p className="text-[12.5px] font-semibold text-ink">
                    {/* 최초 제출은 이전 상태가 없다 — 화살표 없이 결과 상태만 적는다. */}
                    {entry.previousStatus === null
                      ? APPLICATION_STATUS_LABEL[entry.newStatus]
                      : `${APPLICATION_STATUS_LABEL[entry.previousStatus]} → ${APPLICATION_STATUS_LABEL[entry.newStatus]}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-charcoal-3">
                    {formatDateTimeKst(entry.changedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <SectionLabel className="mt-6">지원서 · {detail.answers.length}문항</SectionLabel>
        {detail.answers.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">등록된 질문이 없습니다</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {detail.answers.map((questionAnswer, index) => (
              <li
                key={`${questionAnswer.question}-${index}`}
                className="rounded-xl border border-line bg-cream px-3 py-2.5"
              >
                <p className="text-[12px] font-semibold text-charcoal-2">
                  {questionAnswer.question}
                </p>
                {/* 미답변은 빈칸으로 두면 화면이 깨진 것처럼 보인다 — 답을 안 했다고 말한다. */}
                {questionAnswer.answer ? (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                    {questionAnswer.answer}
                  </p>
                ) : (
                  <p className="mt-1 text-[13px] text-charcoal-3">미작성</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const SectionLabel = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => <p className={`mb-2.5 text-[12px] font-bold text-charcoal-2 ${className}`}>{children}</p>;

const Field = ({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) => (
  <div className={`rounded-xl border border-line bg-cream px-3 py-2 ${span2 ? 'col-span-2' : ''}`}>
    <dt className="text-[10.5px] text-charcoal-2">{label}</dt>
    <dd className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</dd>
  </div>
);

type Props = {
  applicationId: number;
  onClose: () => void;
};

export function AdminApplicationSheet({ applicationId, onClose }: Props) {
  const detailQuery = useAdminApplicationDetailQuery(applicationId);
  const detail = detailQuery.data;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full max-w-[460px] overflow-hidden px-5 py-5">
        <SheetHeader className="sr-only">
          <SheetTitle>지원서 상세</SheetTitle>
          <SheetDescription>지원자 정보·상태 이력·답변을 확인합니다.</SheetDescription>
        </SheetHeader>

        {detailQuery.isLoading && (
          <ListRowsSkeleton rows={6} rowClassName="h-12 rounded-md" label="지원서 불러오는 중" />
        )}
        {detailQuery.isError && (
          <ErrorState
            message="지원서를 불러오지 못했어요."
            onRetry={() => void detailQuery.refetch()}
          />
        )}
        {detail && <AdminApplicationSheetContent detail={detail} />}
      </SheetContent>
    </Sheet>
  );
}
