'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/app/_lib/cn';

type Props = {
  checked: boolean;
  /** 일부만 선택됨. checked 보다 우선해 대시로 표시한다. */
  indeterminate?: boolean;
  disabled?: boolean;
  /** 접근 이름. 시각 요소는 aria-hidden 이라 이 값이 유일한 이름이다. */
  label: string;
  title?: string;
  onChange: () => void;
  className?: string;
};

/**
 * 콘솔 지원자 목록 공용 체크박스 — 20px 커스텀 외형.
 *
 * 네이티브 input 을 없애지 않고 `sr-only` 로 숨긴 뒤 형제 span 을 그린다. 그래서 키보드 포커스·Space
 * 토글·`aria-label`·`disabled`·indeterminate 가 전부 브라우저 기본 동작 그대로 남는다. 포커스 링은
 * `peer-focus-visible` 로 시각 요소에 옮긴다 — 숨긴 input 에 링이 그려지면 화면에서 보이지 않는다.
 *
 * 히트 영역은 이 컴포넌트가 갖지 않는다. 호출부(라벨·td)가 44px 을 소유하고, 여기서는 시각만 담당한다 —
 * 모바일 카드의 44px 라벨과 최종 상태 탭 하강 규칙(PR #939)을 건드리지 않기 위해서다.
 */
export function ApplicantCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  title,
  onChange,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const filled = checked || indeterminate;

  return (
    <span className={cn('relative inline-grid place-items-center', className)}>
      <input
        ref={inputRef}
        type="checkbox"
        aria-label={label}
        title={title}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'grid h-5 w-5 place-items-center rounded-md border-[1.5px] transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-sage peer-focus-visible:ring-offset-1',
          'peer-disabled:opacity-50',
          filled ? 'border-ink-deep bg-ink-deep' : 'border-line bg-paper',
        )}
      >
        {indeterminate ? (
          <span className="h-[2.5px] w-[9px] rounded-full bg-paper" />
        ) : checked ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-paper"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : null}
      </span>
    </span>
  );
}
