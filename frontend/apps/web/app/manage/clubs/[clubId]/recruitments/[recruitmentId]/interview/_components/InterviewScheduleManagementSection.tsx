'use client';

import { useMemo, useState } from 'react';
import { ApiError } from '@duing/api';
import { useCancelInterviewScheduleMutation } from '@duing/hooks';
import type {
  InterviewConfig,
  ManagementSlotView,
  ScheduleListView,
  SlotListView,
} from '@duing/types';
import { ManagementSlotCard } from '@/components/interview/ManagementSlotCard';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { AssignToSlotModal } from './AssignToSlotModal';

// Step 4 — 일정 관리 섹션.
// page-level 에서 fetch 한 schedules + config + slots 를 props 로 받는다.
// - location banner (config.location 있을 때)
// - 2 tab: 전체 일정(시간순 list) / 슬롯별 보기(ManagementSlotCard 그리드)
// - 수동 배정(모달) / 이동(모달) / 취소(window.confirm) 액션

type Tab = 'all' | 'by-slot';

type Props = {
  recruitmentId: number;
  schedules: ScheduleListView[];
  config: InterviewConfig | null;
  slots: SlotListView[];
};

// ScheduleListView -> ManagementSlotView 매핑.
// `assigned` 가 정확한 source-of-truth (PR-FE2 결정에 따라 ManagementSlotCard 는
// `assignedCount ?? assignments.length` 우선순위지만, 본 섹션은 assignments 를 항상 채워 보내므로
// `assignedCount` 는 의도적으로 미지정 — assignments.length 가 카드 표시 기준이 된다).
function toManagementView(row: ScheduleListView): ManagementSlotView {
  return {
    slotId: row.slotId ?? 0,
    startTime: row.startTime ?? '',
    endTime: row.endTime ?? '',
    capacity: row.capacity ?? 0,
    assignments: (row.assigned ?? []).map((assignment) => ({
      scheduleId: assignment.scheduleId ?? 0,
      applicationId: assignment.applicationId ?? 0,
      // 백엔드 응답에 지원자 이름이 없음 — phase 2 에서 별도 query 로 보강 예정.
      applicantLabel: `지원자 #${assignment.applicationId ?? '미상'}`,
      status: assignment.status ?? 'ASSIGNED',
    })),
  };
}

type FlattenedAssignment = {
  scheduleId: number;
  applicationId: number;
  applicantLabel: string;
  status: 'ASSIGNED' | 'CANCELLED';
  slotId: number;
  startTime: string;
  endTime: string;
};

function flattenAssignments(views: ManagementSlotView[]): FlattenedAssignment[] {
  return views
    .flatMap((view) =>
      (view.assignments ?? []).map((assignment) => ({
        scheduleId: assignment.scheduleId,
        applicationId: assignment.applicationId,
        applicantLabel: assignment.applicantLabel,
        status: assignment.status,
        slotId: view.slotId,
        startTime: view.startTime,
        endTime: view.endTime,
      })),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function InterviewScheduleManagementSection({
  recruitmentId,
  schedules,
  config,
  slots,
}: Props) {
  const cancelMutation = useCancelInterviewScheduleMutation(recruitmentId);

  const [tab, setTab] = useState<Tab>('by-slot');
  // 모달에 전달할 applicationId — `null` 이면 모달 닫힘.
  const [assignTarget, setAssignTarget] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const views = useMemo(() => schedules.map(toManagementView), [schedules]);
  const flattened = useMemo(() => flattenAssignments(views), [views]);

  const handleCancel = (applicationId: number) => {
    if (typeof window !== 'undefined') {
      // window.confirm 자체는 phase 2 에서 Dialog 컴포넌트로 교체 예정 — 현 단계는 메시지만 보강.
      const message = `지원자 #${applicationId} 의 면접 일정을 취소하시겠습니까?`;
      const confirmed = window.confirm(message);
      if (!confirmed) return;
    }
    setActionError(null);
    cancelMutation.mutate(applicationId, {
      onError: (mutationError: unknown) => {
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '면접 취소에 실패했습니다.';
        setActionError(message);
      },
    });
  };

  // ScheduleManagement 의 "이동" 콜백 — 같은 모달을 재사용해 새 슬롯을 선택한다.
  // backend 는 `PUT /applications/{id}/interview-schedule` 한 endpoint 가 신규 배정 / 변경을 모두 처리.
  const handleMove = (applicationId: number) => {
    setAssignTarget(applicationId);
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-6"
      aria-labelledby="schedule-management-heading"
    >
      <header className="mb-4">
        <h2
          id="schedule-management-heading"
          className="text-base font-semibold text-slate-900"
        >
          Step 4 · 일정 관리
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          배정 결과를 확인하고 필요 시 슬롯을 직접 조정할 수 있습니다.
        </p>
      </header>

      {config?.location && (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          면접 장소: <strong className="font-semibold">{config.location}</strong>
        </p>
      )}

      <div
        role="tablist"
        aria-label="일정 보기 방식"
        className="mb-4 flex items-center gap-1 border-b border-slate-200"
      >
        <TabButton
          active={tab === 'all'}
          onClick={() => setTab('all')}
          controls="schedule-all-panel"
          id="schedule-all-tab"
        >
          전체 일정
        </TabButton>
        <TabButton
          active={tab === 'by-slot'}
          onClick={() => setTab('by-slot')}
          controls="schedule-by-slot-panel"
          id="schedule-by-slot-tab"
        >
          슬롯별 보기
        </TabButton>
      </div>

      {tab === 'all' && (
        <div
          role="tabpanel"
          id="schedule-all-panel"
          aria-labelledby="schedule-all-tab"
        >
          {flattened.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              배정된 일정이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
              {flattened.map((assignment) => (
                <li
                  key={assignment.scheduleId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-slate-900">
                      {assignment.applicantLabel}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatSlotRange(assignment.startTime, assignment.endTime)}
                      {assignment.status === 'CANCELLED' && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                          취소됨
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleMove(assignment.applicationId)}
                      className="text-xs text-slate-500 underline hover:text-slate-700"
                    >
                      이동
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(assignment.applicationId)}
                      className="text-xs text-rose-600 underline hover:text-rose-800"
                    >
                      취소
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'by-slot' && (
        <div
          role="tabpanel"
          id="schedule-by-slot-panel"
          aria-labelledby="schedule-by-slot-tab"
        >
          {views.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              아직 배정된 슬롯이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {views.map((view) => (
                // 빈 슬롯에서 신규 지원자 배정을 시작하는 UX 는 phase 2 — `onAssign` 미전달로
                // ManagementSlotCard 의 "+지원자 배정" 버튼이 렌더되지 않도록 한다.
                // AssignToSlotModal 은 `handleMove` (이동) 경로에서만 발동된다.
                <ManagementSlotCard
                  key={view.slotId}
                  slot={view}
                  onMove={(applicationId) => handleMove(applicationId)}
                  onCancel={(applicationId) => handleCancel(applicationId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {actionError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {actionError}
        </p>
      )}

      <AssignToSlotModal
        isOpen={assignTarget !== null}
        applicationId={assignTarget}
        recruitmentId={recruitmentId}
        slots={slots}
        onClose={() => setAssignTarget(null)}
      />
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
  controls,
  id,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  controls: string;
  id: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={
        active
          ? 'border-b-2 border-sky-600 px-3 py-1.5 text-sm font-medium text-sky-700'
          : 'px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700'
      }
    >
      {children}
    </button>
  );
}
