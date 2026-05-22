'use client';

import Link from 'next/link';
import type { AdminReportSummary } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { toRoute } from '../../../_lib/route';
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_BADGE_CLASS,
  REPORT_TARGET_TYPE_LABEL,
  REPORT_REASON_LABEL,
} from '../_lib/reportLabels';

type Props = {
  items: AdminReportSummary[];
};

export function AdminReportsTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">조건에 맞는 신고가 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>상태</Th>
            <Th>대상 타입</Th>
            <Th>대상명</Th>
            <Th>사유</Th>
            <Th>신고 일시</Th>
            <Th>상세</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((report) => (
            <tr key={report.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    REPORT_STATUS_BADGE_CLASS[report.status],
                  )}
                >
                  {REPORT_STATUS_LABEL[report.status]}
                </span>
              </Td>
              <Td>{REPORT_TARGET_TYPE_LABEL[report.targetType]}</Td>
              <Td>{report.targetLabel}</Td>
              <Td>{REPORT_REASON_LABEL[report.reasonCode]}</Td>
              <Td>{new Date(report.createdAt).toLocaleString('ko-KR')}</Td>
              <Td>
                <Link
                  href={toRoute(`/admin/reports/${report.id}`)}
                  className="text-[12px] text-charcoal-2 hover:text-ink hover:underline"
                >
                  상세 보기
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
