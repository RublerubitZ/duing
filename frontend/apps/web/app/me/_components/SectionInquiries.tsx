import Link from 'next/link';

import { formatDateKst } from '@duing/hooks/datetime';
import type { FederationInquirySummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ArrowRight } from '@/components/duing/Icon';
import {
  INQUIRY_STATUS_BADGE_CLASS,
  INQUIRY_STATUS_LABEL,
} from '@/app/_lib/federationInquiryLabels';

import { SectionHeader } from './SectionHeader';

type Props = {
  inquiries: FederationInquirySummary[];
  totalCount: number;
};

export function SectionInquiries({ inquiries, totalCount }: Props) {
  return (
    <section
      data-section="inquiries"
      id="sec-inquiries"
      className="pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
        <SectionHeader
          title={`내 문의 · ${totalCount}`}
          hint="총동아리연합회에 남긴 1:1 문의 내역입니다."
          extra={
            <Link
              href={toRoute('/me/inquiries')}
              className="text-[13px] font-semibold text-ink hover:underline"
            >
              전체 보기 →
            </Link>
          }
        />

        {totalCount === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            아직 문의 내역이 없어요.{' '}
            <Link
              href={toRoute('/me/inquiries/new')}
              className="text-ink font-semibold hover:underline"
            >
              새 문의 작성하기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {inquiries.map((inquiry) => (
              <Link
                key={inquiry.id}
                href={toRoute(`/me/inquiries/${inquiry.id}`)}
                aria-label={`${inquiry.title} 문의 상세`}
                className={cn(
                  'bg-paper border border-line rounded-[18px] px-5 py-4',
                  'flex items-center gap-4',
                  'transition-[transform,box-shadow] duration-150',
                  'hover:-translate-y-0.5 hover:shadow-2',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-ink-deep">
                      {inquiry.title}
                    </h3>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        INQUIRY_STATUS_BADGE_CLASS[inquiry.status],
                      )}
                    >
                      {INQUIRY_STATUS_LABEL[inquiry.status]}
                    </span>
                  </div>
                  <div className="mt-1 tabular-nums text-[12px] text-charcoal-3">
                    {formatDateKst(inquiry.createdAt)}
                  </div>
                </div>

                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
