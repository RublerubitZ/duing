/**
 * 조건부 className 결합 헬퍼.
 * - falsy(undefined, null, false, '') 값은 무시한다.
 * - clsx / tailwind-merge 도입 전까지의 경량 버전.
 *
 * 사용 예:
 *   cn('rounded-full px-3', active && 'bg-slate-900 text-white')
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter((value): value is string => Boolean(value)).join(' ');
}
