'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import type { ApplicationStatus } from '@duing/types';
import { useRecruitmentDetailQuery, useApplicantsQuery } from '@duing/hooks';
import { toRoute } from '../../../../../../_lib/route';
import { APPLICATION_STATUS_LABEL } from '../../../../../../_constants/application-status';
import { ApplicantTable } from './_components/ApplicantTable';
import { ApplicantDetailModal } from './_components/ApplicantDetailModal';

type StatusFilter = 'ALL' | ApplicationStatus;

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: '전체', value: 'ALL' },
  { label: APPLICATION_STATUS_LABEL.SUBMITTED, value: 'SUBMITTED' },
  { label: APPLICATION_STATUS_LABEL.UNDER_REVIEW, value: 'UNDER_REVIEW' },
  { label: APPLICATION_STATUS_LABEL.INTERVIEW_PENDING, value: 'INTERVIEW_PENDING' },
  { label: APPLICATION_STATUS_LABEL.ACCEPTED, value: 'ACCEPTED' },
  { label: APPLICATION_STATUS_LABEL.REJECTED, value: 'REJECTED' },
];

export default function ApplicantsPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  const { clubId: clubIdParam, recruitmentId: recruitmentIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const recruitmentId = Number(recruitmentIdParam);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);

  const { data: recruitment, isLoading: isRecruitmentLoading } = useRecruitmentDetailQuery(
    isNaN(recruitmentId) ? undefined : recruitmentId,
  );
  const { data: applicants, isLoading: isApplicantsLoading } = useApplicantsQuery(
    recruitment?.applicationMode === 'SELF' && !isNaN(recruitmentId)
      ? recruitmentId
      : undefined,
  );

  const filteredApplicants =
    applicants?.filter(
      (applicant) => statusFilter === 'ALL' || applicant.status === statusFilter,
    ) ?? [];

  if (isRecruitmentLoading || !recruitment) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{recruitment.title} — 지원자 관리</h1>
      </div>

      {/* 외부 폼 안내 */}
      {recruitment.applicationMode === 'EXTERNAL' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm text-slate-600">
            외부 폼 응답은 외부 시스템에서 확인하세요.
          </p>
          {recruitment.externalFormUrl && (
            <a
              href={recruitment.externalFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-sky-600 hover:underline"
            >
              외부 폼 바로가기 →
            </a>
          )}
        </div>
      )}

      {/* 자체 폼 지원자 표 */}
      {recruitment.applicationMode === 'SELF' && (
        <>
          {/* 상태 필터 칩 */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={
                  statusFilter === option.value
                    ? 'rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white'
                    : 'rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          {isApplicantsLoading && (
            <p className="mt-6 text-sm text-slate-500">지원자 목록 불러오는 중…</p>
          )}

          {!isApplicantsLoading && (
            <ApplicantTable
              applicants={filteredApplicants}
              onDetailOpen={(applicationId) => setSelectedApplicationId(applicationId)}
            />
          )}
        </>
      )}

      {/* 지원자 상세 모달 */}
      {selectedApplicationId !== null && (
        <ApplicantDetailModal
          applicationId={selectedApplicationId}
          recruitmentId={recruitmentId}
          useInterview={recruitment.useInterview}
          onClose={() => setSelectedApplicationId(null)}
        />
      )}

      {/* PII 고지 */}
      <footer className="mt-10 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
        본 정보는 합격 결정 외 용도로 사용하지 않습니다
      </footer>
    </div>
  );
}