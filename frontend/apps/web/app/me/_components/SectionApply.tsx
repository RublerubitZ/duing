import Link from 'next/link';

import { formatDateTimeKst, kstDateTimeFormatter, parseKstInstant } from '@duing/hooks/datetime';
import type { ApplicationStatus, ApplicationSummary, AssignedInterview } from '@duing/types';

import { APPLICATION_STATUS_APPLICANT_LABEL } from '@/app/_constants/application-status';
import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

import { ListLoadError } from './ListLoadError';
import { SectionHeader } from './SectionHeader';

// 서류검토 단계 제거 (스펙 §5-5). 면접을 쓰지 않는 모집은 면접 마디 대신 최종 결과를 둔다 — 상세 스테퍼·지원 내역 행과 같은 규칙.
// 면접 사용 여부를 싣지 않는 옛 응답은 지금처럼 면접 마디를 둔다(fail-open).
const STEPS_WITH_INTERVIEW = ['심사', '면접'] as const;
const STEPS_WITHOUT_INTERVIEW = ['심사', '최종 결과'] as const;

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

// KST "M. D. (요일) 오전/오후 HH:MM" — 면접 일정 요약용 기존 표기 구조 유지.
const INTERVIEW_AT_FORMATTER = kstDateTimeFormatter({
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const statusNote = (status: ApplicationStatus, interview: AssignedInterview | null): string => {
  if (status === 'INTERVIEW_PENDING' && interview) {
    const at = INTERVIEW_AT_FORMATTER.format(parseKstInstant(interview.startAt));
    return interview.location
      ? `면접: ${at} — ${interview.location}`
      : `면접: ${at}`;
  }
  // SUBMITTED·ON_HOLD 는 지원자에게 구분되지 않는다 — 동일한 심사 중 문구 (스펙 §1-1).
  return '동아리에서 심사 중입니다';
};

type Props = {
  applications: ApplicationSummary[];
  /** 조회 중 — 빈 상태 대신 스켈레톤(정적 HTML·조회 전에 거짓 "없어요"를 그리지 않는다, #1500). */
  isPending?: boolean;
  /** 첫 조회가 실패해 받은 목록이 없을 때만 넘긴다(실패 뒤 다시 받는 중에도) — 있으면 빈 안내 대신 실패 안내와 다시 시도(#1579). */
  onRetry?: () => void;
  /** 실패 뒤 다시 받는 중 — 실패 안내를 그대로 두고 다시 시도 버튼만 잠근다(누른 버튼의 포커스가 남게, #1756). onRetry 와 함께 넘긴다. */
  isRetrying?: boolean;
};

export function SectionApply({ applications, isPending = false, onRetry, isRetrying = false }: Props) {
  if (isPending || onRetry || applications.length === 0) {
    return (
      <section
        data-section="apply"
        id="sec-apply"
        className="pt-6 pb-6 md:pt-10 scroll-mt-[60px]"
      >
        <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
          <SectionHeader
            title={isPending || onRetry ? '진행 중인 지원' : '진행 중인 지원 · 0'}
            hint="아직 결과를 기다리고 있는 지원 내역입니다."
          />
          {isPending ? (
            <ListRowsSkeleton rows={2} rowClassName="h-[88px] rounded-lg" label="진행 중인 지원 불러오는 중" />
          ) : onRetry ? (
            <ListLoadError
              message="진행 중인 지원을 불러오지 못했어요."
              onRetry={onRetry}
              isRetrying={isRetrying}
            />
          ) : (
            <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
              진행 중인 지원이 없어요.{' '}
              <Link href="/clubs" className="text-ink font-semibold hover:underline">
                동아리 탐색하러 가기
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      data-section="apply"
      id="sec-apply"
      className="pt-6 pb-6 md:pt-10 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10">
        <SectionHeader
          title={`진행 중인 지원 · ${applications.length}`}
          hint="아직 결과를 기다리고 있는 지원 내역입니다."
        />

        <div className="flex flex-col gap-3">
          {applications.map((app) => {
            const withoutInterview = app.useInterview === false;
            const isInterview = app.status === 'INTERVIEW_PENDING';
            // 운영진이 면접을 끈 모집에 남은 면접 대상은 상세처럼 심사에 머문다.
            const step = withoutInterview && isInterview ? STATUS_STEP.SUBMITTED : STATUS_STEP[app.status];
            // 같은 이유로 면접 일정을 안내하지 않는다 — 버튼이 여는 상세에 면접 정보가 없다(#1695). 남은 확정 배정도 가린다.
            // 끝난 확정 면접도 다음 일정이 아니다 — 결과를 기다리는 동안은 심사 중처럼 보인다. 끝 시각까지는 남겨 늦게 온 지원자도 장소를 본다.
            // 읽지 못하는 끝 시각은 NaN 이라 끝나지 않은 쪽(지금 화면)으로 남는다.
            const interviewEnded = app.interview !== null && parseKstInstant(app.interview.endAt).getTime() <= Date.now();
            const showsInterview = isInterview && !withoutInterview && !interviewEnded;
            const visibleInterview = withoutInterview || interviewEnded ? null : app.interview;
            // 확정 배정이 없는 면접 대상에게는 일정을 단정하지 않는다 — 목록 응답만으로는 응답 요청·대기·라운드 취소를 가를 수 없다.
            const hasSchedule = Boolean(visibleInterview);

            return (
              <div
                key={app.id}
                className={cn(
                  'relative bg-paper rounded-[18px] px-5 py-5',
                  'grid gap-4 lg:gap-5 items-start lg:items-center',
                  // 네 열은 lg 부터 — 640px(sm)에서 켜면 진행 막대(360px 고정)에 밀려 정보 열이 글자 하나 폭까지 눌리고, 그보다 넓어도 한동안 안내 줄이 여러 줄로 꺾인다.
                  'grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_360px_auto]',
                  'transition-[transform,box-shadow,border-color] duration-150',
                  'hover:-translate-y-0.5 hover:shadow-2',
                  showsInterview ? 'border border-ink' : 'border border-line',
                )}
              >
                {showsInterview && (
                  <div className="absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full bg-ink text-white text-[11px] font-bold">
                    {hasSchedule ? '다음 일정' : APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING}
                  </div>
                )}

                {/* Club avatar */}
                <div
                  aria-hidden
                  className="w-14 h-14 rounded-[14px] grid place-items-center text-[26px] font-bold bg-ink/[0.08] text-ink"
                >
                  {(app.clubName || '?').trim().charAt(0)}
                </div>

                {/* Club info */}
                <div className="min-w-0 break-words">
                  <div className="text-[11.5px] font-semibold text-charcoal-3 mb-0.5">
                    {app.recruitmentTitle}
                  </div>
                  <h3 className="text-[19px] font-body text-ink-deep">{app.clubName}</h3>
                  {/* 확정 배정이 없는 면접 대상에게는 지원 상태만 말한다 — '일정 미정'·'조율 중'은 두잉 밖에서 면접을 잡는 동아리나 라운드가 없는 상태에서 거짓이 된다. */}
                  <div className="text-[12.5px] text-charcoal-2 mt-1">
                    {showsInterview && !hasSchedule
                      ? '면접 대상으로 선정되었습니다'
                      : statusNote(app.status, visibleInterview)}
                  </div>
                </div>

                {/* Step progress */}
                <div className="col-span-2 lg:col-span-1">
                  <div className="text-[11.5px] font-semibold text-charcoal-3 tracking-wide04 mb-2">
                    진행 상태
                  </div>
                  <div className="flex gap-1 mb-2">
                    {(withoutInterview ? STEPS_WITHOUT_INTERVIEW : STEPS_WITH_INTERVIEW).map((label, idx) => {
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
                    {visibleInterview ? `면접: ${formatDateTimeKst(visibleInterview.startAt)}` : formatDateTimeKst(app.submittedAt)}
                  </div>
                </div>

                {/* Action button */}
                <Link
                  href={`/me/applications/${app.id}`}
                  className={cn(
                    'btn btn-sm flex items-center gap-1.5 col-span-2 justify-self-start lg:col-span-1',
                    showsInterview ? 'btn-primary' : 'btn-secondary',
                  )}
                >
                  {showsInterview ? (hasSchedule ? '면접 일정 보기' : '진행 상황 보기') : '지원서 보기'}
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
