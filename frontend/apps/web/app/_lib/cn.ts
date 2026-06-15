import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 조건부 className 결합 헬퍼.
 * - falsy(undefined, null, false, '') 값은 무시한다.
 * - clsx 로 조건부 결합 후 tailwind-merge 로 충돌 클래스를 정리한다.
 *   (예: cn('px-2', 'px-4') → 'px-4')
 *
 * 사용 예:
 *   cn('rounded-full px-3', active && 'bg-ink text-paper')
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
