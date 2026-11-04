import { Fragment } from 'react';

import {
  FLOW_DRIFT_LINE,
  FLOW_SCOPE_LINE,
  OTHER_PENDING_ROWS,
  WEEKLY_FLOW_ROWS,
  deltaOf,
  endPendingAbsenceText,
  firstAnswerLine,
} from '../_lib/weeklyBriefingPresentation';
import { DeltaText } from './DeltaText';

import type { AdminWeeklyBriefing } from '@duing/types';
import type { Delta } from '../_lib/weeklyBriefingPresentation';

type Props = { weekStart: string; briefing: AdminWeeklyBriefing; previous: AdminWeeklyBriefing | null };

/** 업무 접수·처리 표 — 합계 = 8칸 합 = 일요일 기록 합계 = 홈 추이 막대. 390 에서도 4열을 지키고 증감은 숫자 아래 줄로 내린다. */
export function WeeklyFlowTable({ weekStart, briefing, previous }: Props) {
  const endPending = briefing.endPending;
  const previousEndPending = previous?.endPending ?? null;
  const firstAnswer = firstAnswerLine(briefing.inquiryFirstAnswer);
  const columnCount = endPending ? 4 : 3;
  return (
    <section className="mt-6 print:break-inside-avoid">
      <h3 id="weekly-flow-heading" className="text-sm font-semibold text-charcoal">
        업무 접수·처리
      </h3>
      <table aria-labelledby="weekly-flow-heading" className="mt-2 w-full table-fixed text-sm">
        <thead>
          <tr className="text-xs text-charcoal-3">
            <th scope="col" className="w-[34%] py-2 text-left font-medium">업무</th>
            <th scope="col" className="py-2 text-right font-medium">접수</th>
            <th scope="col" className="py-2 text-right font-medium">처리</th>
            {endPending ? <th scope="col" className="break-keep py-2 text-right font-medium">주 끝 남은 대기</th> : null}
          </tr>
        </thead>
        <tbody>
          {WEEKLY_FLOW_ROWS.map((row) => {
            const flow = briefing.flow[row.key];
            const previousFlow = previous?.flow[row.key];
            return (
              <Fragment key={row.key}>
                <tr className="border-t border-line">
                  <th scope="row" className="break-keep py-2 text-left font-medium text-charcoal">{row.label}</th>
                  <CountCell value={flow.receivedCount} delta={deltaOf(flow.receivedCount, previousFlow?.receivedCount, '건')} />
                  <CountCell value={flow.handledCount} delta={deltaOf(flow.handledCount, previousFlow?.handledCount, '건')} />
                  {endPending ? (
                    <CountCell
                      value={endPending[row.endPendingKey]}
                      delta={deltaOf(endPending[row.endPendingKey], previousEndPending?.[row.endPendingKey], '건')}
                    />
                  ) : null}
                </tr>
                {row.key === 'inquiry' && firstAnswer ? (
                  <tr>
                    <td colSpan={columnCount} className="pb-2 pl-3 text-xs text-charcoal-3">{firstAnswer}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
        {endPending ? (
          <tbody>
            <tr className="border-t border-line">
              <th scope="rowgroup" colSpan={4} className="pb-1 pt-3 text-left text-xs font-semibold text-charcoal-3">
                그 밖의 대기(남은 것만)
              </th>
            </tr>
            {OTHER_PENDING_ROWS.map((row) => (
              <tr key={row.endPendingKey} className="border-t border-line">
                <th scope="row" className="break-keep py-2 text-left font-medium text-charcoal">{row.label}</th>
                <NotCountedCell />
                <NotCountedCell />
                <CountCell
                  value={endPending[row.endPendingKey]}
                  delta={deltaOf(endPending[row.endPendingKey], previousEndPending?.[row.endPendingKey], '건')}
                />
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <th scope="row" className="py-2 text-left text-charcoal">합계</th>
              <td />
              <td />
              <CountCell
                value={endPending.totalPendingCount}
                delta={deltaOf(endPending.totalPendingCount, previousEndPending?.totalPendingCount, '건')}
              />
            </tr>
          </tbody>
        ) : null}
      </table>
      {endPending ? null : (
        <p className="mt-2 break-keep text-xs text-charcoal-2">{endPendingAbsenceText(weekStart, briefing.pendingRecordStartedOn)}</p>
      )}
      <p className="mt-2 break-keep text-xs text-charcoal-3">{FLOW_SCOPE_LINE}</p>
      <p className="mt-1 break-keep text-xs text-charcoal-3">{FLOW_DRIFT_LINE}</p>
    </section>
  );
}

function CountCell({ value, delta }: { value: number; delta: Delta | null }) {
  return (
    <td className="py-2 text-right tabular-nums text-charcoal">
      <span className="font-semibold">{value}</span>
      {delta ? <DeltaText delta={delta} /> : null}
    </td>
  );
}

function NotCountedCell() {
  return (
    <td className="py-2 text-right text-charcoal-3">
      <span aria-hidden>—</span>
      <span className="sr-only">세지 않음</span>
    </td>
  );
}
