'use client';

import { useState } from 'react';

import type { AdminSuccessionDetail, ProcessSuccessionPayload, SuccessionStatus } from '@duing/types';

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
  succession: AdminSuccessionDetail;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (payload: ProcessSuccessionPayload) => void;
  onCancel: () => void;
};

const ACTION_NOTE_MAX = 1000;
const TERMINAL_STATUSES: Exclude<SuccessionStatus, 'PENDING'>[] = ['APPROVED', 'REJECTED'];
const STATUS_LABEL_MAP: Record<Exclude<SuccessionStatus, 'PENDING'>, string> = {
  APPROVED: '승인',
  REJECTED: '거절',
};

const noteCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminSuccessionProcessDialog({ succession, isPending, errorMessage, onConfirm, onCancel }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<Exclude<SuccessionStatus, 'PENDING'>>('APPROVED');
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
        busy={isPending}
      >
        <DialogHeader>
          <DialogTitle>승계 요청 처리</DialogTitle>
          <DialogDescription>
            요청 #<span className="font-medium text-charcoal-2">{succession.id}</span> — {succession.club.name}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-charcoal-2">처리 결과 선택</legend>
          <div className="flex gap-4">
            {TERMINAL_STATUSES.map((statusOption) => (
              <label key={statusOption} className="flex cursor-pointer items-center gap-2 text-sm text-charcoal">
                <input
                  type="radio"
                  name="successionStatus"
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

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-charcoal-2">처리 메모 (선택)</span>
            <textarea
              value={actionNote}
              aria-describedby="succession-action-note-hint"
              onChange={(event) => setActionNote(event.target.value.slice(0, ACTION_NOTE_MAX))}
              rows={4}
              placeholder="처리 메모를 입력하세요"
              className={noteCls}
            />
            <p className="text-right text-[11px] text-charcoal-3">
              {actionNote.length} / {ACTION_NOTE_MAX}
            </p>
          </label>
          {/* 안내는 라벨 밖에 두고 설명으로 잇는다 — 라벨 안 요소는 입력란 이름에 섞인다(글자 수 카운터는 기존 구조 그대로). */}
          <p id="succession-action-note-hint" className="break-keep text-[11px] text-charcoal-3">
            요청한 임원에게 그대로 보여요. 거절이면 사유를 적어 주세요.
          </p>
        </div>

        {errorMessage && <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral-deep">{errorMessage}</p>}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className={
              selectedStatus === 'APPROVED'
                ? 'btn btn-primary btn-sm disabled:opacity-50'
                : 'btn btn-sm btn-danger disabled:opacity-50'
            }
          >
            {isPending && <ButtonSpinner />}
            {`${STATUS_LABEL_MAP[selectedStatus]}${selectedStatus === 'REJECTED' ? '로' : '으로'} 처리`}
          </button>
        </DialogFooter>
        <span role="status" className="sr-only">{isPending ? '승계 요청 처리 중' : null}</span>
      </DialogContent>
    </Dialog>
  );
}
