'use client';

import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminApplicant } from '@duing/types';

import { APPLICATION_STATUS_LABEL } from '@/app/_constants/application-status';
import { EmptyState } from '../../_components/EmptyState';
import { APPLICATION_STATUS_BADGE_CLASS, collegeMajorLabel } from '../_lib/recruitmentLabels';

type Props = {
  items: AdminApplicant[];
  onOpenApplication: (applicationId: number) => void;
};

/**
 * 총동연 지원자 목록 — 읽기 전용이다. 선택 체크박스도 일괄 처리도 두지 않는다: 심사는 동아리
 * 운영진의 일이고 총동연은 확인만 한다.
 */
export function AdminApplicantsTable({ items, onOpenApplication }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="조회 결과가 없습니다"
        body={'검색어를 줄이거나 상태 필터를 바꿔보세요.\n이름과 학번으로 찾을 수 있어요.'}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <colgroup>
          <col className="w-[140px]" />
          <col className="w-[132px]" />
          <col />
          <col className="w-[112px]" />
          <col className="w-[150px]" />
        </colgroup>
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>이름</Th>
            <Th>학번</Th>
            <Th>학부 · 학과</Th>
            <Th>상태</Th>
            <Th>지원일</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((applicant) => (
            <tr
              key={applicant.applicationId}
              onClick={() => onOpenApplication(applicant.applicationId)}
              className="cursor-pointer border-t border-line hover:bg-graysoft/50"
            >
              <Td>
                {/* 행 전체가 클릭 대상이지만 키보드로도 열 수 있어야 해서 이름은 버튼으로 둔다.
                    버튼이 이미 열기를 처리하므로 행 핸들러까지 타지 않게 전파를 끊는다. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenApplication(applicant.applicationId);
                  }}
                  className="truncate text-[13.5px] font-semibold text-charcoal hover:underline"
                >
                  {applicant.userName}
                </button>
              </Td>
              <Td>
                <span className="text-charcoal-2">{applicant.studentId}</span>
              </Td>
              <Td>
                <span className="text-charcoal-2">
                  {collegeMajorLabel(applicant.college, applicant.major)}
                </span>
              </Td>
              <Td>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                    APPLICATION_STATUS_BADGE_CLASS[applicant.status]
                  }`}
                >
                  {APPLICATION_STATUS_LABEL[applicant.status]}
                </span>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-charcoal-3">
                  {formatDateTimeKst(applicant.submittedAt)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-3 py-2 text-left font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
