import { Check } from 'lucide-react';
import { FadeIn } from '@/components/motion/FadeIn';
import { Reveal } from '../motion/Reveal';

type OldTool = { tool: string; task: string; tilt: string };

const OLD_WAY: ReadonlyArray<OldTool> = [
  { tool: '카카오톡', task: '공지 전달', tilt: '-1.5deg' },
  { tool: '구글폼', task: '지원서 접수', tilt: '1.2deg' },
  { tool: '엑셀', task: '회비 정산', tilt: '-0.8deg' },
  { tool: '수기 · 단톡', task: '멤버 · 출석 관리', tilt: '1.6deg' },
];

const NEW_WAY: ReadonlyArray<string> = [
  '모집 공고와 지원 접수',
  '공지 · 일정 전달',
  '회비 청구 · 납부 · 은행 매칭',
  '멤버 · 권한 관리',
];

export function BeforeAfter() {
  return (
    <section className="px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 tabular-nums text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FOR LEADERS · 동아리를 운영한다면
          </p>
          <h2 className="mb-3 max-w-[820px]" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)' }}>
            공지는 카카오톡, 지원서는 구글폼,
            <br />
            회비는 엑셀로 관리하고 있나요?
          </h2>
          <p className="mb-12 max-w-[620px] text-[16.5px] text-charcoal-2">
            이제는 흩어진 도구 대신, 하나의 플랫폼으로 운영하세요.
          </p>
        </FadeIn>

        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-4">
          {/* Before — 흩어진 도구 */}
          <Reveal x={-28}>
            <div className="rounded-lg border border-line bg-graysoft/60 p-6 md:p-7">
              <span className="pill pill-outline mb-5">기존 방식</span>
              <div className="flex flex-col gap-2.5">
                {OLD_WAY.map((item) => (
                  <div
                    key={item.tool}
                    className="flex items-center justify-between rounded-md border border-dashed border-line bg-paper/70 px-3.5 py-3"
                    style={{ transform: `rotate(${item.tilt})` }}
                  >
                    <span className="text-[14px] font-semibold text-charcoal-2">{item.tool}</span>
                    <span className="tabular-nums text-[11.5px] text-charcoal-3">{item.task}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Arrow */}
          <FadeIn delay={0.15}>
            <div className="grid place-items-center">
              <span
                className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper shadow-2"
                aria-hidden
              >
                <span className="rotate-90 text-lg md:rotate-0">→</span>
              </span>
            </div>
          </FadeIn>

          {/* After — 두잉 */}
          <Reveal x={28} scale={0.97} delay={0.1}>
            <div className="rounded-lg border border-line bg-paper p-6 shadow-2 md:p-7">
              <span className="pill pill-solid mb-5">두잉 하나로</span>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {NEW_WAY.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-[14.5px] font-medium text-ink-deep">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage-mist text-ink">
                      <Check size={12} strokeWidth={2.5} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 text-[13.5px] text-charcoal-3">
                한 화면에서, 한 번의 로그인으로.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
