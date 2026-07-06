'use client';

// "이 답변이 도움이 되었나요?" 피드백 버튼 — 로그인 여부와 무관하게 항상 렌더한다.
// 카운트(helpfulCount/notHelpfulCount)는 admin 전용 갭 신호이므로 이 화면 어디에도 표시하지 않는다.
// 이 기기에서 이미 제출한 선택은 localStorage 로 복원하고, 반대 버튼을 누르면 값을 갱신(재제출)한다.

import { useEffect, useState } from 'react';
import { useSubmitFaqFeedbackMutation } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  getFaqFeedbackSessionKey,
  getMyFaqFeedback,
  setMyFaqFeedback,
} from '../_lib/faqFeedbackSession';

type Props = {
  faqId: number;
};

export function FaqFeedback({ faqId }: Props) {
  const { addToast } = useToast();
  const feedbackMutation = useSubmitFaqFeedbackMutation();
  const [selectedHelpful, setSelectedHelpful] = useState<boolean | null>(null);

  // 마운트 시 이 기기에 기록된 선택을 복원한다.
  useEffect(() => {
    setSelectedHelpful(getMyFaqFeedback(faqId));
  }, [faqId]);

  const handleSubmit = async (helpful: boolean) => {
    try {
      await feedbackMutation.mutateAsync({
        faqId,
        payload: { helpful, sessionKey: getFaqFeedbackSessionKey() ?? undefined },
      });
      setMyFaqFeedback(faqId, helpful);
      setSelectedHelpful(helpful);
    } catch (error) {
      addToast(extractErrorMessage(error) ?? '피드백 제출에 실패했어요', { variant: 'error' });
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-line pt-4">
      <span className="text-[13px] font-semibold text-charcoal-2">이 답변이 도움이 되었나요?</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={feedbackMutation.isPending}
          onClick={() => handleSubmit(true)}
          aria-pressed={selectedHelpful === true}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            selectedHelpful === true
              ? 'border-ink bg-ink text-paper'
              : 'border-line bg-paper text-charcoal-2 hover:border-ink',
          )}
        >
          👍 도움됐어요
        </button>
        <button
          type="button"
          disabled={feedbackMutation.isPending}
          onClick={() => handleSubmit(false)}
          aria-pressed={selectedHelpful === false}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            selectedHelpful === false
              ? 'border-ink bg-ink text-paper'
              : 'border-line bg-paper text-charcoal-2 hover:border-ink',
          )}
        >
          👎 아쉬워요
        </button>
      </div>
      {selectedHelpful !== null && (
        <span className="text-[12.5px] text-charcoal-3">의견이 반영되었어요</span>
      )}
    </div>
  );
}
