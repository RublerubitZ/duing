'use client';

/**
 * 관리자 콘솔 공용 오류 상태. EmptyState 의 짝이다 — 데이터가 없는 것과 못 가져온 것은 다르고,
 * 후자는 사용자가 할 수 있는 일(다시 시도)이 있으므로 안내만 하고 끝내지 않는다.
 *
 * <p>role="alert" 로 두는 이유는 조회 실패가 화면 전환 없이 그 자리에서 바뀌는 변화라, 시각적으로
 * 보고 있지 않으면 알 수 없기 때문이다.
 */
export function ErrorState({
  message,
  onRetry,
  variant = 'block',
}: {
  message: string;
  /** 없으면 안내만 한다 — 재시도가 의미 없는 실패(권한 등)도 있다. */
  onRetry?: () => void;
  /** block: 목록 전체가 실패해 카드 본문을 대신한다. inline: 화면 일부만 실패한 한 줄 배너. */
  variant?: 'block' | 'inline';
}) {
  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal-2"
      >
        <span>{message}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-ghost btn-sm ml-2">
            다시 시도
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="alert" className="px-6 py-14 text-center">
      <p aria-hidden className="mb-3.5 text-[40px] leading-none opacity-90">
        ⚠️
      </p>
      <p className="text-[15.5px] font-bold text-ink-deep">{message}</p>
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={onRetry} className="btn btn-sm btn-secondary">
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
