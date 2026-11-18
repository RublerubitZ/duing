'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@duing/api';
import { useApplicationDraftMutation } from '@duing/hooks';
import type { DraftAnswer } from '@duing/types';
import { TEXT_ANSWER_MAX_LENGTH } from '../_components/ApplyAnswersStep';

export type AutosaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'closed' }
  | { kind: 'error'; message: string };

type Options = { recruitmentId: number; enabled: boolean };

const hasOverflowAnswer = (answers: DraftAnswer[]) =>
  answers.some((answer) => answer.values.some((value) => value.length > TEXT_ANSWER_MAX_LENGTH));

export function useAutosaveDraft(
  answers: DraftAnswer[],
  { recruitmentId, enabled }: Options,
) {
  const mutation = useApplicationDraftMutation(recruitmentId);
  const { mutate } = mutation;
  // 떠날 때 저장 전용 관찰자 — 디바운스 저장의 관찰자를 reset 하면, 정리만 돌고 화면은 남는 렌더링(Activity hidden)에서 진행 중 저장까지 떼어 '저장 중'에 멈춘다.
  const { mutateAsync: saveOnLeave, reset: resetLeaveSave } = useApplicationDraftMutation(recruitmentId);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  // 서버에 이미 있거나(마운트 시드·저장 성공) 다시 보내도 결과가 같은(400·404·2000자 넘침) 답변 직렬화 — 같으면 보내지 않는다.
  const lastSerializedRef = useRef<string | null>(null);
  // 언마운트 정리 함수는 마운트 때 한 번만 걸린다 — 떠나는 순간의 값은 렌더마다 갱신하는 ref 로 읽는다.
  const latestRef = useRef({ answers, enabled, statusKind: autosaveStatus.kind });

  useEffect(() => {
    latestRef.current = { answers, enabled, statusKind: autosaveStatus.kind };
  });

  // 화면을 떠나면 디바운스가 지운 마지막 입력을 한 번 보낸다 — 저장 중이어도 scope 가 진행 중 저장 뒤로 줄 세운다.
  useEffect(
    () => () => {
      const { answers: leavingAnswers, enabled: leavingEnabled, statusKind } = latestRef.current;
      const serialized = JSON.stringify(leavingAnswers);
      if (!leavingEnabled || statusKind === 'closed') return;
      if (lastSerializedRef.current === null || serialized === lastSerializedRef.current) return;
      if (hasOverflowAnswer(leavingAnswers)) return;
      // 알릴 화면이 없어 실패는 삼키고, 끝나면 관찰자를 떼어 MutationCache 가 치우게 한다(붙어 있으면 답 전문이 남는다).
      void saveOnLeave({ answers: leavingAnswers }).catch(() => undefined).finally(resetLeaveSave);
    },
    [saveOnLeave, resetLeaveSave],
  );

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
      // 넘친 값(한글 조합 중·옛 초안)은 보내도 400 이다 — 보내지 않고 알린 뒤, 다른 값으로 바뀌면 그 값을 저장한다.
      if (hasOverflowAnswer(answers)) {
        setAutosaveStatus({
          kind: 'error',
          message: `${TEXT_ANSWER_MAX_LENGTH}자를 넘은 답변이 있어 임시저장하지 않았어요. ${TEXT_ANSWER_MAX_LENGTH}자 이내로 줄여 주세요.`,
        });
        lastSerializedRef.current = serialized;
        return;
      }
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
