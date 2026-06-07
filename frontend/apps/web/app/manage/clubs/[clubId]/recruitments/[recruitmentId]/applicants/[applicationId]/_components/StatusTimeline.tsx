'use client';

import type { ApplicationStatusHistoryItem } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';

type Props = {
  history: ApplicationStatusHistoryItem[];
  submittedAt: string;
};

export function StatusTimeline({ history, submittedAt }: Props) {
  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">상태 변경 이력</h2>
      <ol className="flex flex-col gap-3">
        {history.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span
              className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500"
              aria-hidden
            />
            <div className="flex-1">
              <p className="text-sm text-slate-900">
                <strong>{APPLICATION_STATUS_LABEL[item.newStatus]}</strong>
                <span className="text-neutral-500">
                  {' '}
                  ← {APPLICATION_STATUS_LABEL[item.previousStatus]}
                </span>
              </p>
              <p className="text-xs text-neutral-500">
                {item.changedByName} ·{' '}
                {new Date(item.changedAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </li>
        ))}

        {/* SUBMITTED 시작점 — history 유무와 관계없이 항상 표시 */}
        <li className="flex items-start gap-3">
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-neutral-300"
            aria-hidden
          />
          <div className="flex-1">
            <p className="text-sm text-neutral-600">
              {APPLICATION_STATUS_LABEL.SUBMITTED}
            </p>
            <p className="text-xs text-neutral-500">
              {new Date(submittedAt).toLocaleString('ko-KR')}
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
