'use client';

import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { formatDateKst, formatDateTimeKst } from '@duing/hooks';
import type { Applicant, ApplicationStatus } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import {
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '../../../../../../../_constants/application-status';
import { toRoute } from '../../../../../../../_lib/route';
import { STATUS_BADGE_CLASS } from '../_lib/applicantStatus';

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-neutral-400">—</span>;
  const colorClass =
    score >= 4
      ? 'bg-emerald-100 text-emerald-700'
      : score === 3
        ? 'bg-neutral-100 text-neutral-700'
        : 'bg-rose-100 text-rose-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${colorClass}`}>
      {score} / 5
    </span>
  );
}

type Props = {
  applicants: Applicant[];
  selectedIds: number[];
  selectedSet: ReadonlySet<number>;
  onSelect: (next: number[]) => void;
  useInterview: boolean;
  clubId: number;
  recruitmentId: number;
};

export function ApplicantTable({
  applicants,
  selectedIds,
  selectedSet,
  onSelect,
  useInterview,
  clubId,
  recruitmentId,
}: Props) {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();

  const toggleRow = (applicationId: number, status: ApplicationStatus) => {
    if (isTerminalApplicationStatus(status)) return;
    const isSelected = selectedSet.has(applicationId);
    onSelect(
      isSelected
        ? selectedIds.filter((id) => id !== applicationId)
        : [...selectedIds, applicationId],
    );
  };

  const navigateToDetail = (applicationId: number) => {
    const currentQs = searchParams.toString();
    if (currentQs) {
      router.push(
        toRoute(
          `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}?${currentQs}`,
        ),
      );
    } else {
      router.push(
        toRoute(
          `/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants/${applicationId}`,
        ),
      );
    }
  };

  return (
    <>
    {/* 데스크탑/태블릿: 표 (모바일은 아래 카드 리스트) */}
    <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-10 px-4 py-3" />
            <th className="px-4 py-3 text-left font-medium text-slate-600">이름</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학과</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학번</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">학년</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">지원일시</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">상태</th>
            {useInterview && (
              <th className="px-4 py-3 text-left font-medium text-slate-600">면접일정</th>
            )}
            <th className="px-4 py-3 text-left font-medium text-slate-600">내 점수</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalApplicationStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => navigateToDetail(applicant.applicationId)}
                className={`cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-slate-50' : ''}`}
              >
                <td
                  className="px-4 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`${applicant.userName} 선택`}
                    checked={isSelected}
                    disabled={isTerminal}
                    onChange={() => toggleRow(applicant.applicationId, applicant.status)}
                    title={
                      isTerminal
                        ? '최종 상태인 지원자는 선택할 수 없습니다.'
                        : undefined
                    }
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{applicant.userName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {COLLEGE_DISPLAY_NAME[applicant.college]} · {applicant.major}
                </td>
                <td className="px-4 py-3 text-slate-600">{applicant.studentId}</td>
                <td className="px-4 py-3 text-slate-600">{GRADE_DISPLAY_NAME[applicant.grade]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateTimeKst(applicant.submittedAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[applicant.status]}`}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </td>
                {useInterview && (
                  <td className="px-4 py-3 text-slate-600">
                    {applicant.interviewStartAt
                      ? formatDateTimeKst(applicant.interviewStartAt)
                      : '—'}
                  </td>
                )}
                <td className="px-4 py-3">
                  <MyScoreBadge score={applicant.myScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

      {/* 모바일: 카드 리스트 (표 대신) */}
      <div className="mt-4 space-y-2 md:hidden">
        {applicants.map((applicant) => {
          const isTerminal = isTerminalApplicationStatus(applicant.status);
          const isSelected = selectedSet.has(applicant.applicationId);
          return (
            <div
              key={applicant.applicationId}
              onClick={() => navigateToDetail(applicant.applicationId)}
              className={`cursor-pointer rounded-xl border p-3 transition ${
                isSelected ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-0.5">
                {/*
                 * 선택 영역과 카드 이동 영역을 분리한다. 체크박스(16px)만으로는 손가락 터치가
                 * 자주 카드로 새어 상세로 이동해버리므로, 44px 라벨로 감싸 히트 영역을 넓히고
                 * 라벨에서 전파를 끊는다. 음수 마진(-my-3 -ml-3 = 카드 padding)으로 카드 좌상단
                 * 모서리까지 히트 영역을 밀어내되 레이아웃 높이는 그대로 둔다.
                 * 최종 상태 카드는 선택할 것이 없으므로 히트 영역을 두지 않는다 — 전파를 끊으면
                 * 카드 높이의 절반이 아무 반응 없는 영역이 된다. 44px 박스는 정렬을 위한 자리로만
                 * 남기고(전파 차단 없음), 비활성 체크박스는 pointer-events 를 꺼 탭이 카드까지
                 * 내려가게 한다. 선택할 것이 없는 카드라 오터치로 잃을 선택도 없다.
                 * 주의: 라벨 클릭은 input 으로 포워딩됐다 되돌아와 onClick 이 2회 실행된다.
                 * 부수효과 있는 로직을 여기 얹지 말 것(토글은 input 의 onChange 가 1회만 받는다).
                 */}
                <label
                  onClick={isTerminal ? undefined : (event) => event.stopPropagation()}
                  className="-my-3 -ml-3 grid h-11 w-11 shrink-0 place-items-center"
                >
                  <input
                    type="checkbox"
                    aria-label={`${applicant.userName} 선택`}
                    checked={isSelected}
                    disabled={isTerminal}
                    onChange={() => toggleRow(applicant.applicationId, applicant.status)}
                    title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:pointer-events-none disabled:opacity-50"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium leading-5 text-slate-900">
                      {applicant.userName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${STATUS_BADGE_CLASS[applicant.status]}`}
                    >
                      {APPLICATION_STATUS_LABEL[applicant.status]}
                    </span>
                  </div>
                  {/* 좁은 화면(320px)에서 긴 단과대·학과는 잘라내지 않고 줄바꿈한다 — 카드 높이보다 정보가 우선. */}
                  <div className="flex items-start justify-between gap-2 text-[12.5px] leading-[17px] text-slate-600">
                    <span>
                      {COLLEGE_DISPLAY_NAME[applicant.college]} · {applicant.major}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-slate-500">
                      지원 {formatDateKst(applicant.submittedAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[12px] leading-4 text-slate-500">
                    <span>
                      학번 {applicant.studentId} · {GRADE_DISPLAY_NAME[applicant.grade]}
                    </span>
                    <MyScoreBadge score={applicant.myScore} />
                  </div>
                  {useInterview && (
                    <div className="text-[11.5px] leading-4 text-slate-500">
                      면접{' '}
                      {applicant.interviewStartAt
                        ? formatDateTimeKst(applicant.interviewStartAt)
                        : '—'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
