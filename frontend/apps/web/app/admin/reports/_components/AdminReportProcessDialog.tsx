'use client';

import { useState } from 'react';

import type { AdminReportDetail, ProcessReportPayload, ReportStatus } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Props = {
  report: AdminReportDetail;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (payload: ProcessReportPayload) => void;
  onCancel: () => void;
};

const ACTION_NOTE_MAX = 1000;
const TERMINAL_STATUSES: Exclude<ReportStatus, 'PENDING'>[] = ['RESOLVED', 'DISMISSED'];
const STATUS_LABEL_MAP: Record<Exclude<ReportStatus, 'PENDING'>, string> = {
  RESOLVED: '해결',
  DISMISSED: '기각',
};

const noteCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminReportProcessDialog({ report, isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<Exclude<ReportStatus, 'PENDING'>>('RESOLVED');
  const [actionNote, setActionNote] = useState('');

  const handleSubmit = () => {
    onConfirm({ status: selectedStatus, actionNote: actionNote.trim() || undefined });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>신고 처리</DialogTitle>
          <DialogDescription>
            신고 #<span className="font-medium text-charcoal-2">{report.id}</span> — {report.targetLabel}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-charcoal-2">처리 결과 선택</legend>
          <div className="flex gap-4">
            {TERMINAL_STATUSES.map((statusOption) => (
              <label key={statusOption} className="flex cursor-pointer items-center gap-2 text-sm text-charcoal">
                <input
                  type="radio"
                  name="reportStatus"
                  value={statusOption}
                  checked={selectedStatus === statusOption}
                  onChange={() => setSelectedStatus(statusOption)}
                  className="accent-ink"
                />
                {STATUS_LABEL_MAP[statusOption]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-charcoal-2">처리 메모 (선택)</span>
          <textarea
            value={actionNote}
            onChange={(event) => setActionNote(event.target.value.slice(0, ACTION_NOTE_MAX))}
            rows={4}
            placeholder="처리 메모를 입력하세요"
            className={noteCls}
          />
          <p className="text-right text-[11px] text-charcoal-3">
            {actionNote.length} / {ACTION_NOTE_MAX}
          </p>
        </label>

        {errorMessage && <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className={
              selectedStatus === 'RESOLVED'
                ? 'btn btn-primary btn-sm disabled:opacity-50'
                : 'btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50'
            }
          >
            {isPending && <ButtonSpinner />}
            {`${STATUS_LABEL_MAP[selectedStatus]}${selectedStatus === 'RESOLVED' ? '로' : '으로'} 처리`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
