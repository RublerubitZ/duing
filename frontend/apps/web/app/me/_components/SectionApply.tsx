import Link from 'next/link';

import { formatDateTimeKst, kstDateTimeFormatter, parseKstInstant } from '@duing/hooks/datetime';
import type { ApplicationStatus, ApplicationSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';

import { SectionHeader } from './SectionHeader';

// 서류검토 단계 제거 (스펙 §5-5). 목록 응답에는 useInterview 가 없어 미니 진행바는
// 항상 2단으로 근사하고, 면접 단계 조건부 표시는 상세 스테퍼가 담당한다.
const STEPS = ['심사', '면접'] as const;

// 전 상태에 값을 두어 렌더 중 행을 버리지 않는다 — 카운트는 세고 행은 안 그리는 유령 항목을 만들지
// 않기 위해서다. 진행 중 목록에는 종결 상태가 들어오지 않지만(분류가 걸러낸다) 방어값을 남긴다.
const STATUS_STEP: Record<ApplicationStatus, number> = {
  SUBMITTED: 1,
  // 보류는 지원자에게 심사 중과 동일하게 보인다 (스펙 §1-1).
  ON_HOLD: 1,
  INTERVIEW_PENDING: 2,
  ACCEPTED: 2,
  REJECTED: 2,
};

const ACTION_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '지원서 보기',
  ON_HOLD: '지원서 보기',
  INTERVIEW_PENDING: '면접 일정 보기',
  ACCEPTED: '지원서 보기',
  REJECTED: '지원서 보기',
};

// KST "M. D. (요일) 오전/오후 HH:MM" — 면접 일정 요약용 기존 표기 구조 유지.
const INTERVIEW_AT_FORMATTER = kstDateTimeFormatter({
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const statusNote = (app: ApplicationSummary): string => {
  if (app.status === 'INTERVIEW_PENDING' && app.interview) {
    const at = INTERVIEW_AT_FORMATTER.format(parseKstInstant(app.interview.startAt));
    return app.interview.location
      ? `면접: ${at} — ${app.interview.location}`
      : `면접: ${at}`;
  }
  // SUBMITTED·ON_HOLD 는 지원자에게 구분되지 않는다 — 동일한 심사 중 문구 (스펙 §1-1).
  return '동아리에서 심사 중입니다';
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
        className="px-4 sm:px-6 md:px-10 pt-10 pb-6 scroll-mt-[60px]"
      >
        <div className="max-w-layout mx-auto">
          <SectionHeader
            title="진행 중인 지원 · 0"
            hint="아직 결과를 기다리고 있는 지원 내역입니다."
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
      className="px-4 sm:px-6 md:px-10 pt-10 pb-6 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title={`진행 중인 지원 · ${applications.length}`}
          hint="아직 결과를 기다리고 있는 지원 내역입니다."
        />

        <div className="flex flex-col gap-3">
          {applications.map((app) => {
            const step = STATUS_STEP[app.status];
            const isInterview = app.status === 'INTERVIEW_PENDING';

            return (
              <div
                key={app.id}
                className={cn(
                  'relative bg-paper rounded-[18px] px-5 py-5',
                  'grid gap-4 sm:gap-5 items-start sm:items-center',
                  'grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_360px_auto]',
                  'transition-[transform,box-shadow,border-color] duration-150',
                  'hover:-translate-y-0.5 hover:shadow-2',
                  isInterview ? 'border border-ink' : 'border border-line',
                )}
              >
                {isInterview && (
                  <div className="absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full bg-ink text-white text-[11px] font-bold">
                    📌 다음 일정
                  </div>
                )}

                {/* Club avatar */}
                <div
                  className="w-14 h-14 rounded-[14px] grid place-items-center text-[26px] tabular-nums font-bold"
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
                <div className="col-span-2 sm:col-span-1">
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
                  <div className="text-[12px] text-charcoal-3 tabular-nums">
                    {app.interview ? `면접: ${formatDateTimeKst(app.interview.startAt)}` : formatDateTimeKst(app.submittedAt)}
                  </div>
                </div>

                {/* Action button */}
                <Link
                  href={`/me/applications/${app.id}`}
                  className={cn(
                    'btn btn-sm flex items-center gap-1.5 col-span-2 justify-self-start sm:col-span-1',
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
