import Link from 'next/link';

import { formatDateKst } from '@duing/hooks/datetime';
import type { ApplicationStatus, ApplicationSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';
import { ClubLogo } from '@/app/_components/ClubLogo';

import { SectionHeader } from './SectionHeader';

type ArchivedStatus = Extract<ApplicationStatus, 'ACCEPTED' | 'REJECTED'>;

const PILL: Record<ArchivedStatus, { label: string; className: string }> = {
  ACCEPTED: {
    label: '🎉 합격',
    className: 'bg-sage-mist text-ink-deep border-sage-mist',
  },
  REJECTED: {
    label: '📝 불합격',
    className: 'bg-paper text-charcoal-3 border-line',
  },
};

const isArchivedStatus = (status: ApplicationStatus): status is ArchivedStatus =>
  status === 'ACCEPTED' || status === 'REJECTED';

type Props = {
  applications: ApplicationSummary[];
};

export function SectionArchived({ applications }: Props) {
  return (
    <section
      data-section="archived"
      id="sec-archived"
      className="px-4 sm:px-6 md:px-10 pt-8 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`지난 지원 · ${applications.length}`}
          hint="합격 또는 불합격으로 마무리된 지원 내역입니다."
        />

        {applications.length === 0 ? (
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            지난 지원 내역이 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {applications.map((app) => {
              if (!isArchivedStatus(app.status)) return null;
              const pill = PILL[app.status];

              return (
                <Link
                  key={app.id}
                  href={`/me/applications/${app.id}`}
                  aria-label={`${app.clubName} 지원 상세`}
                  className={cn(
                    'bg-paper border border-line rounded-[18px] px-5 py-5',
                    'flex items-center gap-4',
                    'transition-[transform,box-shadow] duration-150',
                    'hover:-translate-y-0.5 hover:shadow-2',
                  )}
                >
                  <div
                    className="w-14 h-14 rounded-[14px] grid place-items-center text-[26px] shrink-0 bg-sage-mist text-ink-deep relative overflow-hidden"
                  >
                    <ClubLogo logoUrl={app.logoUrl} alt={app.clubName}>
                      <span>🏛</span>
                    </ClubLogo>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-semibold text-charcoal-3 mb-0.5">
                      {app.recruitmentTitle}
                    </div>
                    <h3 className="text-[16px] font-bold text-ink-deep">{app.clubName}</h3>
                    <div className="text-[12px] text-charcoal-3 font-mono mt-1">
                      {formatDateKst(app.submittedAt)}
                    </div>
                  </div>

                  <span className={cn('pill text-[10.5px] border', pill.className)}>
                    {pill.label}
                  </span>

                  <ArrowRight size={14} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
