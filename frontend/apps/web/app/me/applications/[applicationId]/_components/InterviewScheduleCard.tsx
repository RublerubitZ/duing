'use client';

import { useState } from 'react';
import { useMyInterviewScheduleQuery, useRecruitmentDetailQuery } from '@duing/hooks';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { EditAvailabilityModal } from './EditAvailabilityModal';

// 지원자 마이페이지에서 노출되는 면접 일정 카드.
// useInterview=true 인 모집의 application 에서만 의미가 있으므로,
// recruitment.useInterview=false 면 카드를 렌더하지 않는다.
//
// 분기:
//   - schedule.assigned=false → "자동 배정 대기 중" + canEdit 조건 시 "가능시간 수정" 버튼
//   - schedule.assigned=true  → 일정·장소 표시. status=CANCELLED 일 때 "취소됨" 배지
//
// canEdit 판정:
//   - recruitment.interviewAvailabilityDeadline 가 현재 시각 이후 (deadline 전)
//   - schedule.assigned=false (자동 배정 미완료)
//   두 조건 모두 충족할 때만 수정 버튼 노출. backend 가 결국 409 로 안전하게 거부한다.
//
// 운영진 전용 interview-config 엔드포인트는 학생 권한으로 접근 불가하므로
// availabilityDeadline 은 RecruitmentDetail 의 동일 필드를 사용한다.
type Props = {
  applicationId: number;
  recruitmentId: number;
};

export function InterviewScheduleCard({ applicationId, recruitmentId }: Props) {
  const scheduleQuery = useMyInterviewScheduleQuery(applicationId);
  const recruitmentQuery = useRecruitmentDetailQuery(recruitmentId);
  const [isEditModalOpen, setEditModalOpen] = useState(false);

  // 모집 정보 로딩 전에는 카드 자체 렌더 보류 — flicker 방지.
  if (recruitmentQuery.isLoading) {
    return null;
  }
  if (!recruitmentQuery.data?.useInterview) {
    // 면접 미사용 모집은 카드 자체 미렌더.
    return null;
  }

  if (scheduleQuery.isLoading) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500"
      >
        면접 일정을 불러오는 중…
      </section>
    );
  }

  if (!scheduleQuery.data) return null;

  const schedule = scheduleQuery.data;
  const deadlineIso = recruitmentQuery.data.interviewAvailabilityDeadline;

  if (!schedule.assigned) {
    const isBeforeDeadline = deadlineIso
      ? new Date() < new Date(deadlineIso)
      : false;
    const canEdit = isBeforeDeadline;

    return (
      <section
        aria-labelledby="interview-schedule-card-title"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h3
          id="interview-schedule-card-title"
          className="text-sm font-semibold text-slate-900"
        >
          면접 일정
        </h3>
        <p className="mt-2 text-sm text-slate-600">자동 배정 대기 중</p>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            가능시간 수정
          </button>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            가능시간 수정 기간이 종료되었습니다.
          </p>
        )}
        <EditAvailabilityModal
          isOpen={isEditModalOpen}
          onClose={() => setEditModalOpen(false)}
          applicationId={applicationId}
          recruitmentId={recruitmentId}
        />
      </section>
    );
  }

  const { startTime, endTime, status } = schedule.schedule;
  const isCancelled = status === 'CANCELLED';

  return (
    <section
      aria-labelledby="interview-schedule-card-title"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h3
          id="interview-schedule-card-title"
          className="text-sm font-semibold text-slate-900"
        >
          면접 일정
        </h3>
        {isCancelled && (
          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
            취소됨
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline gap-3">
          <dt className="w-16 shrink-0 text-xs font-medium text-slate-500">
            일시
          </dt>
          <dd className="text-slate-800">
            {formatSlotRange(startTime ?? '', endTime ?? '')}
          </dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="w-16 shrink-0 text-xs font-medium text-slate-500">
            장소
          </dt>
          <dd className="text-slate-800">
            {schedule.location ?? (
              <span className="text-slate-500">장소는 추후 안내됩니다.</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
