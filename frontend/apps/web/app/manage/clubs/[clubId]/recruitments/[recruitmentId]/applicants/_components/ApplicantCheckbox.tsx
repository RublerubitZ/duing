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
    /* title 은 래퍼가 갖는다 — sr-only input 에 두면 hit chain 에 없어 hover 로 뜨지 않는다. */
    <span title={title} className={cn('relative inline-grid place-items-center', className)}>
      <input
        ref={inputRef}
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          // radius 는 어휘 안의 rounded-sm(8px) — rounded-md 는 14px 라 20px 박스에서 원이 된다.
          'grid h-5 w-5 place-items-center rounded-sm border transition-colors',
          /*
           * 포커스는 ring(box-shadow) 이 아니라 outline 으로 그린다. input 이 sr-only 라 UA 기본
           * 아웃라인이 잘려 나가 이게 유일한 포커스 신호인데, box-shadow 는 강제 색 모드에서
           * 사양상 무시돼 표시가 통째로 사라진다. outline-color 는 시스템 색으로 치환돼 살아남는다.
           */
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
          'peer-disabled:opacity-50',
          /*
           * 미선택 테두리는 charcoal-3 다. 이 레포엔 @tailwindcss/forms 가 없어 예전 네이티브
           * 체크박스는 UA 기본 테두리(약 4.5:1)로 그려졌는데, 외형을 직접 그리면서 border-line
           * (#E5E2DA, 흰 배경 1.29:1)을 쓰면 빈 체크박스가 사실상 보이지 않는다(1.4.11 미달).
           */
          filled ? 'border-ink-deep bg-ink-deep' : 'border-charcoal-3 bg-paper',
        )}
      >
        {/* 대시도 체크와 같은 SVG stroke 로 그린다 — 배경색으로 그린 도형은 강제 색 모드에서 사라진다. */}
        {indeterminate ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            className="text-paper"
          >
            <path d="M5 12h14" />
          </svg>
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
