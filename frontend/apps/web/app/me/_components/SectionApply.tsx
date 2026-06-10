import Link from 'next/link';

import type { ApplicationSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

type ActiveApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW_PENDING';

const STEPS = ['서류', '검토', '면접'] as const;

const STATUS_STEP: Record<ActiveApplicationStatus, number> = {
  SUBMITTED: 1,
  UNDER_REVIEW: 2,
  INTERVIEW_PENDING: 3,
};

const ACTION_LABEL: Record<ActiveApplicationStatus, string> = {
  SUBMITTED: '지원서 보기',
  UNDER_REVIEW: '지원서 보기',
  INTERVIEW_PENDING: '면접 일정 보기',
};

const isActiveStatus = (status: string): status is ActiveApplicationStatus =>
  status in STATUS_STEP;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const statusNote = (app: ApplicationSummary): string => {
  if (app.status === 'INTERVIEW_PENDING' && app.interview) {
    const at = new Date(app.interview.startAt).toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return app.interview.location
      ? `면접: ${at} — ${app.interview.location}`
      : `면접: ${at}`;
  }
  if (app.status === 'UNDER_REVIEW') return '동아리에서 검토 중입니다';
  return '지원서 작성 완료';
};

type Props = {
  applications: ApplicationSummary[];
};

export function SectionApply({ applications }: Props) {
  if (applications.length === 0) {
    return (
      <section
        data-section="apply"
        id="sec-apply"
        className="px-10 pt-10 pb-6 scroll-mt-[60px]"
      >
        <div className="max-w-layout mx-auto">
          <SectionHeader
            title="진행 중인 지원 · 0"
            hint="현재 지원서를 작성 중이거나 결과를 기다리는 동아리입니다."
          />
          <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
            진행 중인 지원이 없어요.{' '}
            <Link href="/clubs" className="text-ink font-semibold hover:underline">
              동아리 탐색하러 가기 →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-section="apply"
      id="sec-apply"
      className="px-10 pt-10 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`진행 중인 지원 · ${applications.length}`}
          hint="현재 지원서를 작성 중이거나 결과를 기다리는 동아리입니다."
        />

        <div className="flex flex-col gap-3">
          {applications.map((app) => {
            if (!isActiveStatus(app.status)) return null;
            const step = STATUS_STEP[app.status];
            const isInterview = app.status === 'INTERVIEW_PENDING';

            return (
              <div
                key={app.id}
                className={cn(
                  'relative bg-paper rounded-[18px] px-5 py-5',
                  'grid gap-5 items-center',
                  'transition-[transform,box-shadow,border-color] duration-150',
                  'hover:-translate-y-0.5 hover:shadow-2',
                  isInterview ? 'border border-ink' : 'border border-line',
                )}
                style={{ gridTemplateColumns: 'auto 1fr 360px auto' }}
              >
                {isInterview && (
                  <div className="absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full bg-ink text-white text-[11px] font-bold">
                    📌 다음 일정
                  </div>
                )}

                {/* Club avatar */}
                <div
                  className="w-14 h-14 rounded-[14px] grid place-items-center text-[26px] font-mono font-bold"
                  style={{ background: 'rgba(31,74,54,0.08)', color: '#1F4A36' }}
                >
                  🏛
                </div>

                {/* Club info */}
                <div>
                  <div className="text-[11.5px] font-semibold text-charcoal-3 mb-0.5">
                    {app.recruitmentTitle}
                  </div>
                  <h3 className="text-[19px] font-body text-ink-deep">{app.clubName}</h3>
                  <div className="text-[12.5px] text-charcoal-2 mt-1">{statusNote(app)}</div>
                </div>

                {/* Step progress */}
                <div>
                  <div className="text-[11.5px] font-semibold text-charcoal-3 tracking-wide04 mb-2">
                    진행 상태
                  </div>
                  <div className="flex gap-1 mb-2">
                    {STEPS.map((label, idx) => {
                      const done = idx < step;
                      const isCurrent = idx === step - 1;
                      return (
                        <div key={label} className="flex-1">
                          <div
                            className={cn(
                              'h-1 rounded-full mb-1',
                              done || isCurrent ? 'bg-ink' : 'bg-line',
                            )}
                          />
                          <div
                            className={cn(
                              'text-[11px]',
                              isCurrent
                                ? 'font-bold text-ink'
                                : done
                                  ? 'font-medium text-charcoal-2'
                                  : 'font-medium text-charcoal-3',
                            )}
                          >
                            {label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[12px] text-charcoal-3 font-mono">
                    {app.interview ? `면접: ${formatDate(app.interview.startAt)}` : formatDate(app.submittedAt)}
                  </div>
                </div>

                {/* Action button */}
                <Link
                  href={`/me/applications/${app.id}`}
                  className={cn(
                    'btn btn-sm flex items-center gap-1.5',
                    isInterview ? 'btn-primary' : 'btn-secondary',
                  )}
                >
                  {ACTION_LABEL[app.status]}
                  <ArrowRight size={14} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
