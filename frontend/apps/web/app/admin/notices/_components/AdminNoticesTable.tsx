'use client';

import Link from 'next/link';
import { formatDateKst } from '@duing/hooks';
import type { AdminNoticeSummary } from '@duing/types';
import { toRoute } from '../../../_lib/route';
import { NOTICE_CATEGORY_LABEL } from '../../../notices/_lib/categoryLabels';
import { VISIBILITY_LABEL } from '../_lib/visibilityLabels';

type Props = {
  items: AdminNoticeSummary[];
  onDeleteClick: (id: number, title: string) => void;
};

export function AdminNoticesTable({ items, onDeleteClick }: Props) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-charcoal-3 text-[13px]">조건에 맞는 공지가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>제목</Th><Th>카테고리</Th><Th>노출 범위</Th><Th>발행일</Th><Th>만료</Th><Th>알림</Th><Th>고정</Th><Th>액션</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((notice) => (
            <tr key={notice.id} className="border-t border-line">
              <Td>
                <Link href={toRoute(`/admin/notices/${notice.id}/edit`)} className="hover:underline">
                  {notice.title}
                </Link>
              </Td>
              <Td>{NOTICE_CATEGORY_LABEL[notice.category]}</Td>
              <Td>{VISIBILITY_LABEL[notice.visibility]}</Td>
              <Td>{formatDateKst(notice.createdAt)}</Td>
              <Td>{notice.expiresAt ? formatDateKst(notice.expiresAt) : '—'}</Td>
              <Td>{notice.notifyOnPublish ? '발송' : '미발송'}</Td>
              <Td>{notice.pinned ? '📌' : ''}</Td>
              <Td>
                <div className="flex gap-2">
                  <Link
                    href={toRoute(`/admin/notices/${notice.id}/edit`)}
                    className="text-[12px] text-charcoal-2 hover:text-ink"
                  >수정</Link>
                  <button
                    type="button"
                    onClick={() => onDeleteClick(notice.id, notice.title)}
                    className="text-[12px] text-coral hover:underline"
                  >삭제</button>
                </div>
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
