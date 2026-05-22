'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { AdminPromotionSummary } from '@duing/types';
import { toRoute } from '../../../_lib/route';
import { CURATION_LABEL, getActiveBadgeClass, getActiveLabel } from '../_lib/promotionLabels';

type Props = {
  items: AdminPromotionSummary[];
  onDeleteClick: (id: number, title: string) => void;
};

export function AdminPromotionsTable({ items, onDeleteClick }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 배너가 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>썸네일</Th>
            <Th>제목</Th>
            <Th>동아리</Th>
            <Th>활성</Th>
            <Th>순서</Th>
            <Th>등록자</Th>
            <Th>등록일</Th>
            <Th>액션</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((promotion) => (
            <tr key={promotion.id} className="border-t border-line">
              <Td>
                <div className="relative w-16 h-9 rounded overflow-hidden bg-graysoft">
                  <Image
                    src={promotion.bannerImageUrl}
                    alt={promotion.title}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              </Td>
              <Td>
                <Link
                  href={toRoute(`/admin/promotions/${promotion.id}/edit`)}
                  className="hover:underline"
                >
                  {promotion.title}
                </Link>
              </Td>
              <Td>
                {promotion.club ? (
                  <span>{promotion.club.name}</span>
                ) : (
                  <span className="text-charcoal-3">{CURATION_LABEL}</span>
                )}
              </Td>
              <Td>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${getActiveBadgeClass(promotion.active)}`}
                >
                  {getActiveLabel(promotion.active)}
                </span>
              </Td>
              <Td>{promotion.displayOrder}</Td>
              <Td>{promotion.createdBy.name}</Td>
              <Td>{new Date(promotion.createdAt).toLocaleDateString('ko-KR')}</Td>
              <Td>
                <div className="flex gap-2">
                  <Link
                    href={toRoute(`/admin/promotions/${promotion.id}/edit`)}
                    className="text-[12px] text-charcoal-2 hover:text-ink"
                  >
                    수정
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDeleteClick(promotion.id, promotion.title)}
                    className="text-[12px] text-coral hover:underline"
                  >
                    삭제
                  </button>
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
