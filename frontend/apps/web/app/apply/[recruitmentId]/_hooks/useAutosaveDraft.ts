'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@duing/api';
import { useApplicationDraftMutation } from '@duing/hooks';
import type { DraftAnswer } from '@duing/types';

export type AutosaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'closed' }
  | { kind: 'error'; message: string };

type Options = { recruitmentId: number; enabled: boolean };

export function useAutosaveDraft(
  answers: DraftAnswer[],
  { recruitmentId, enabled }: Options,
) {
  const mutation = useApplicationDraftMutation(recruitmentId);
  const { mutate } = mutation;
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || autosaveStatus.kind === 'closed') return;
    const serialized = JSON.stringify(answers);
    if (serialized === lastSerializedRef.current) return;

    const timer = setTimeout(() => {
      setAutosaveStatus({ kind: 'saving' });
      mutate(
        { answers },
        {
          onSuccess: () => {
            lastSerializedRef.current = serialized;
            setAutosaveStatus({ kind: 'saved', at: new Date() });
          },
          onError: (mutationError: unknown) => {
            if (mutationError instanceof ApiError && mutationError.status === 410) {
              setAutosaveStatus({ kind: 'closed' });
            } else {
              setAutosaveStatus({
                kind: 'error',
                message: '임시저장에 실패했어요. 잠시 후 다시 시도해주세요.',
              });
            }
          },
        },
      );
    }, 2000);

    return () => clearTimeout(timer);
  }, [answers, enabled, recruitmentId, mutate, autosaveStatus.kind]);

  return autosaveStatus;
}
