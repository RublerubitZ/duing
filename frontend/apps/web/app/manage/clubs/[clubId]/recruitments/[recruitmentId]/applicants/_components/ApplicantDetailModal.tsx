'use client';

import { useState } from 'react';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import { useApplicantDetail, useUpdateApplicationStatus } from '@duing/hooks';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { getStatusTransitions } from './applicationStatusTransitions';
import { InterviewModal } from './InterviewModal';

const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-sky-100 text-sky-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-purple-100 text-purple-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

type ApplicantDetailModalProps = {
  applicationId: number;
  recruitmentId: number;
  useInterview: boolean;
  onClose: () => void;
};

export function ApplicantDetailModal({
  applicationId,
  recruitmentId,
  useInterview,
  onClose,
}: ApplicantDetailModalProps) {
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { data: applicantDetail, isLoading } = useApplicantDetail(applicationId);
  const updateStatus = useUpdateApplicationStatus(recruitmentId);

  async function handleStatusChange(nextStatus: UpdateApplicationStatusPayload['status']) {
    setStatusError(null);
    try {
      await updateStatus.mutateAsync({
        applicationId,
        payload: { status: nextStatus },
      });
      onClose();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
        <div className="relative w-full max-w-lg rounded-xl bg-white shadow-lg">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">지원자 상세</h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">
                본 정보는 합격 결정 외 용도로 사용하지 않습니다
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            {isLoading && (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            )}

            {applicantDetail && (
              <>
                {/* 신원 정보 */}
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    신원 정보
                  </h3>
                  <dl className="space-y-1 rounded-lg border border-slate-200 p-4">
                    <div className="flex gap-4">
                      <dt className="w-16 shrink-0 text-sm text-slate-500">이름</dt>
                      <dd className="text-sm text-slate-900">{applicantDetail.applicant.name}</dd>
                    </div>
                    <div className="flex gap-4">
                      <dt className="w-16 shrink-0 text-sm text-slate-500">학번</dt>
                      <dd className="text-sm text-slate-900">{applicantDetail.applicant.studentId}</dd>
                    </div>
                    <div className="flex gap-4">
                      <dt className="w-16 shrink-0 text-sm text-slate-500">이메일</dt>
                      <dd className="text-sm text-slate-900">{applicantDetail.applicant.email}</dd>
                    </div>
                  </dl>
                </section>

                {/* 현재 상태 */}
                <section className="mb-5 flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">현재 상태</span>
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[applicantDetail.status]}`}
                  >
                    {APPLICATION_STATUS_LABEL[applicantDetail.status]}
                  </span>
                </section>

                {/* 면접 정보 */}
                {(applicantDetail.interviewAt || applicantDetail.interviewLocation) && (
                  <section className="mb-5 rounded-lg border border-purple-100 bg-purple-50 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-600">
                      면접 정보
                    </h3>
                    {applicantDetail.interviewAt && (
                      <p className="text-sm text-slate-700">
                        일시: {new Date(applicantDetail.interviewAt).toLocaleString('ko-KR')}
                      </p>
                    )}
                    {applicantDetail.interviewLocation && (
                      <p className="text-sm text-slate-700">
                        장소: {applicantDetail.interviewLocation}
                      </p>
                    )}
                  </section>
                )}

                {/* 답변 목록 */}
                {applicantDetail.answers.length > 0 && (
                  <section className="mb-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      답변
                    </h3>
                    <ol className="space-y-3">
                      {applicantDetail.answers.map((qaItem, index) => (
                        <li
                          key={index}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <p className="mb-1 text-sm font-medium text-slate-700">
                            {index + 1}. {qaItem.question}
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-slate-600">
                            {qaItem.answer}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {/* 상태 변경 */}
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    상태 변경
                  </h3>
                  {statusError && (
                    <p className="mb-2 text-sm text-rose-600">{statusError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {getStatusTransitions(applicantDetail.status, useInterview).map(
                      (nextStatus) => (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={updateStatus.isPending}
                          onClick={() => handleStatusChange(nextStatus)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {APPLICATION_STATUS_LABEL[nextStatus]}으로 변경
                        </button>
                      ),
                    )}
                    {getStatusTransitions(applicantDetail.status, useInterview).length === 0 && (
                      <p className="text-sm text-slate-400">더 이상 변경 가능한 상태가 없습니다.</p>
                    )}
                  </div>
                </section>

                {/* 면접 일정 입력 버튼 (INTERVIEW_PENDING 상태일 때) */}
                {applicantDetail.status === 'INTERVIEW_PENDING' && (
                  <section className="mb-2">
                    <button
                      type="button"
                      onClick={() => setShowInterviewModal(true)}
                      className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                    >
                      면접 일정 입력
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showInterviewModal && (
        <InterviewModal
          recruitmentId={recruitmentId}
          applicationId={applicationId}
          onClose={() => setShowInterviewModal(false)}
        />
      )}
    </>
  );
}