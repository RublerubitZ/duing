'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { ApplicationStatusHistoryItem } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';

type Props = {
  history: ApplicationStatusHistoryItem[];
  submittedAt: string;
};

export function StatusTimeline({ history, submittedAt }: Props) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-base font-semibold text-ink">상태 변경 이력</h2>
      <ol className="flex flex-col gap-3">
        {history
          // V99 치환 잔재(previousStatus === newStatus)는 숨긴다 — DB 는 감사 목적으로 보존
          .filter((item) => item.previousStatus !== item.newStatus)
          .map((item) => (
            <li key={`${item.changedAt}-${item.changedById}`} className="flex items-start gap-3">
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-ink"
                aria-hidden
              />
              {/* min-w-0 이 없으면 flex 자식은 콘텐츠 최소폭 아래로 못 줄어들어, 긴 변경자 이름이 320px 에서 넘친다. */}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-charcoal">
                  <strong>{APPLICATION_STATUS_LABEL[item.newStatus]}</strong>
                  <span className="text-charcoal-3">
                    {' '}
                    ← {APPLICATION_STATUS_LABEL[item.previousStatus]}
                  </span>
                </p>
                <p className="break-words text-xs text-charcoal-3">
                  {item.changedByName} ·{' '}
                  {formatDateTimeKst(item.changedAt)}
                </p>
              </div>
            </li>
          ))}

        {/* SUBMITTED 시작점 — history 유무와 관계없이 항상 표시 */}
        <li className="flex items-start gap-3">
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-sage-soft"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-charcoal-2">
              {APPLICATION_STATUS_LABEL.SUBMITTED}
            </p>
            <p className="text-xs text-charcoal-3">
              {formatDateTimeKst(submittedAt)}
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
