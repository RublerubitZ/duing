import { describe, expect, it, vi } from 'vitest';

// 감시 구간에 신고 창과 상관없는 모듈이 실리지 않도록, 화면 렌더에만 쓰는 훅·토스트는 목으로 둔다.
vi.mock('@duing/hooks', () => ({
  useSubmitReportMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// 운영 CSP 의 script-src 에 'unsafe-eval' 이 없다. 신고 창은 import 그래프에 공유 스키마(@duing/schemas)가 없고 모듈 최상위에서
// 자기 스키마를 만들므로, 공유 스키마의 JIT 설정에 기대지 않고 스스로 꺼야 한다. 설정값이 아니라 Function 생성자가 실제로
// 불리지 않는지를 봐야 설정 줄이 스키마보다 뒤로 밀린 경우도 잡는다. 감시를 건 뒤에 처음 평가되도록 정적으로 import 하지 않는다.
describe('ReportModal — zod JIT 미사용', () => {
  it('신고 창 모듈을 불러와도 Function 생성자를 부르지 않는다', async () => {
    const evalBodies: string[] = [];
    const OriginalFunction = globalThis.Function;
    globalThis.Function = new Proxy(OriginalFunction, {
      construct(target, args: string[]) {
        evalBodies.push(String(args.at(-1)));
        return Reflect.construct(target, args);
      },
      apply(target, thisArg, args: string[]) {
        evalBodies.push(String(args.at(-1)));
        return Reflect.apply(target, thisArg, args);
      },
    });
    try {
      await import('@/components/report/ReportModal');
    } finally {
      globalThis.Function = OriginalFunction;
    }
    expect(evalBodies).toEqual([]);
  });
});
