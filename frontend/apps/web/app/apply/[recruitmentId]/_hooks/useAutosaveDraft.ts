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
  // 서버에 이미 있거나(마운트 시드·저장 성공) 다시 보내도 결과가 같은(400·404) 답변 직렬화 — 같으면 보내지 않는다.
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(answers);
    // 첫 실행 값 = 마운트 시드다. 열기만 해서는 저장하지 않는다 — 저장 시각이 방문 시각이 되고,
    // 조회가 실패한 채 열린 폼이면 빈 답이 서버 초안을 덮는다(RecruitmentForm 의 initialDraftSnapshot 과 같은 방식).
    if (lastSerializedRef.current === null) {
      lastSerializedRef.current = serialized;
      return;
    }
    // 저장 중엔 타이머를 걸지 않는다 — PUT 이 겹치면 늦게 끝난 옛 내용이 새 내용을 덮을 수 있다.
    // 끝나서 kind 가 바뀌면 이 effect 가 그때의 답으로 다시 돈다.
    if (!enabled || autosaveStatus.kind === 'closed' || autosaveStatus.kind === 'saving') return;
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
              // 400(답변 길이 등)·404(모집 없음·비공개 동아리)는 같은 내용을 다시 보내도 같다 — 답이 바뀔 때만 다시 보낸다.
              // 5xx·NETWORK·TIMEOUT, 갱신이 잠깐 안 돼 올라온 401 은 지금처럼 2초 뒤 같은 내용을 다시 보낸다.
              if (mutationError instanceof ApiError && (mutationError.status === 400 || mutationError.status === 404)) {
                lastSerializedRef.current = serialized;
              }
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
