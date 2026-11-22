'use client';

import { useId } from 'react';

type Props = {
  /** 무엇을 못 불러왔는지 — 같은 자리의 빈 안내와 같은 해요체("…을 불러오지 못했어요."). */
  message: string;
  /** 그 목록 쿼리의 refetch — 데이터 없이 다시 받으면 조회 중으로 돌아가 이 자리가 스켈레톤으로 바뀐다. */
  onRetry: () => void;
};

/**
 * 첫 조회가 실패해 받은 목록이 없는 자리 — 거짓 빈 안내("…없어요") 대신 그린다(#1579).
 * 라이브 영역 역할(alert·status)은 주지 않는다 — 사용자 행동에 대한 응답이 아니라 화면 상태다(#1549 의 /me/applications 오류 상자와 같음).
 */
export function ListLoadError({ message, onRetry }: Props) {
  const messageId = useId();

  return (
    <div className="bg-paper border border-line rounded-lg px-8 py-12 text-center text-charcoal-3 text-sm">
      <p id={messageId}>{message}</p>
      {/* 실패한 목록이 여럿이면 '다시 시도'도 여럿이다 — 버튼만 훑어도 어느 목록 것인지 들리게 문구를 설명으로 잇는다. */}
      <button type="button" onClick={onRetry} aria-describedby={messageId} className="btn btn-secondary btn-sm mt-3">
        다시 시도
      </button>
    </div>
  );
}
