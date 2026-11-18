import { describe, it, expect } from 'vitest';

// 운영 CSP(Report-Only)의 script-src 에 'unsafe-eval' 이 없다 — zod 4 의 JIT 는 객체 스키마를 만들 때 Function 생성자로 eval
// 가능 여부를 시험하고, 동기 검사 때 검사 함수를 Function 생성자로 만든다. 설정값(jitless)이 아니라 생성자가 실제로 불리지 않는지를
// 봐야, 설정 줄이 지워지거나 스키마 생성보다 뒤로 밀린 경우(import 하는 하위 모듈은 이 모듈 본문보다 먼저 평가된다)까지 잡는다.
// 감시를 건 뒤에 zod·스키마 모듈이 처음 평가돼야 하므로 이 파일에서는 둘 다 정적으로 import 하지 않는다.
describe('zod JIT 미사용', () => {
  it('공유 스키마를 불러와 동기 검사해도 Function 생성자를 부르지 않는다', async () => {
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
      const { createFeePolicySchema } = await import('../src/index');
      createFeePolicySchema.safeParse({ name: '', amount: '1.5' });
    } finally {
      globalThis.Function = OriginalFunction;
    }
    expect(evalBodies).toEqual([]);
  });
});
