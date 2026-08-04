'use client';

import Link from 'next/link';

import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminRecruitmentSummary } from '@duing/types';

import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { toRoute } from '@/app/_lib/route';
import { EmptyState } from '../../_components/EmptyState';
import {
  RECRUITMENT_STATUS_BADGE_CLASS,
  RECRUITMENT_STATUS_LABEL,
  applicationModeLabel,
  needsOperatorAttention,
} from '../_lib/recruitmentLabels';

type Props = {
  items: AdminRecruitmentSummary[];
  onOpenDetail: (recruitment: AdminRecruitmentSummary) => void;
};

export function AdminRecruitmentsTable({ items, onOpenDetail }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="조회 결과가 없습니다"
        body={'검색어를 줄이거나 상태·방식 필터를 바꿔보세요.\n동아리명과 모집 제목으로 찾을 수 있어요.'}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-[13px]">
        <colgroup>
          <col className="w-[140px]" />
          <col />
          <col className="w-[110px]" />
          <col className="w-[124px]" />
          <col className="w-[88px]" />
          <col className="w-[188px]" />
          <col className="w-[128px]" />
        </colgroup>
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>동아리</Th>
            <Th>모집 제목</Th>
            <Th>방식</Th>
            <Th>상태</Th>
            <Th align="right">지원자</Th>
            <Th>기간</Th>
            <Th>마지막 수정</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((recruitment) => (
            <tr
              key={recruitment.recruitmentId}
              onClick={() => onOpenDetail(recruitment)}
              className="cursor-pointer border-t border-line hover:bg-graysoft/50"
            >
              <Td>
                <span className="block truncate text-[13.5px] font-semibold text-charcoal">
                  {recruitment.clubName}
                </span>
              </Td>
              <Td>
                <div className="flex min-w-0 items-center gap-2">
                  {/* 행 전체가 클릭 대상이지만 키보드·새 탭으로도 들어갈 수 있어야 해서 제목은 링크로 둔다.
                      링크 자체가 이동을 처리하므로 행 핸들러까지 타지 않게 전파를 끊는다. */}
                  <Link
                    href={toRoute(`/admin/recruitments/${recruitment.recruitmentId}`)}
                    onClick={(event) => event.stopPropagation()}
                    className="truncate text-charcoal hover:underline"
                  >
                    {recruitment.title}
                  </Link>
                  {needsOperatorAttention(recruitment) && (
                    <span className="pill-warm shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                      운영 개입 필요
                    </span>
                  )}
                </div>
              </Td>
              {/* 목록 응답에는 외부 폼 URL 이 없다 — 플랫폼명은 상세에서만 붙는다. */}
              <Td>{applicationModeLabel(recruitment.applicationMode, null)}</Td>
              <Td>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                    RECRUITMENT_STATUS_BADGE_CLASS[recruitment.status]
                  }`}
                >
                  {RECRUITMENT_STATUS_LABEL[recruitment.status]}
                </span>
              </Td>
              {/* 외부 폼 모집은 두잉에 지원 데이터가 없다 — 0 으로 적으면 "아무도 안 냈다"로 읽힌다. */}
              <Td align="right">
                {recruitment.applicantCount === null ? '—' : `${recruitment.applicantCount}명`}
              </Td>
              <Td>
                <span className="whitespace-nowrap text-charcoal-2">
                  {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                </span>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-charcoal-3">
                  {formatDateTimeKst(recruitment.updatedAt)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <td className={`px-3 py-2 align-middle ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
);
