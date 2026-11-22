'use client';

import { useId } from 'react';

type Props = {
  /** 무엇을 못 불러왔는지 — 같은 자리의 빈 안내와 같은 해요체("…을 불러오지 못했어요."). */
  message: string;
  /** 그 목록 쿼리의 refetch. */
  onRetry: () => void;
  /**
   * 실패 뒤 다시 받는 중 — 상자를 그대로 두고 같은 버튼의 문구만 바꿔 잠근다(누른 버튼의 포커스가 남게, #1756).
   */
  isRetrying?: boolean;
};

/**
 * 첫 조회가 실패해 받은 목록이 없는 자리 — 거짓 빈 안내("…없어요") 대신 그린다(#1579).
 * 라이브 영역 역할(alert·status)은 주지 않는다 — 사용자 행동에 대한 응답이 아니라 화면 상태다(#1549 의 /me/applications 오류 상자와 같음).
 */
export function ListLoadError({ message, onRetry, isRetrying = false }: Props) {
  const messageId = useId();

  return (
    <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
      <p id={messageId}>{message}</p>
      {/* 실패한 목록이 여럿이면 '다시 시도'도 여럿이다 — 버튼만 훑어도 어느 목록 것인지 들리게 문구를 설명으로 잇는다. */}
      {/* 다시 받는 동안에도 같은 버튼 노드를 둔다 — disabled 는 포커스를 떨어뜨리므로 aria-disabled 로 잠근다. 누름을 무시하는 건
          aria-disabled 의 뜻(누를 수 없음)과 맞추려는 것이다(데이터 없는 재요청은 TanStack 이 진행 중 요청으로 합쳐 요청은 늘지 않는다). */}
      <button
        type="button"
        onClick={() => {
          if (!isRetrying) onRetry();
        }}
        aria-disabled={isRetrying || undefined}
        aria-describedby={messageId}
        className="btn btn-secondary btn-sm mt-3"
      >
        {isRetrying ? '다시 불러오는 중' : '다시 시도'}
      </button>
    </div>
  );
}
