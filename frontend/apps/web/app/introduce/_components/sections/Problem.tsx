import { FadeIn } from '@/components/motion/FadeIn';
import { Stagger, StaggerItem } from '../motion/Stagger';

type PainPoint = { emoji: string; title: string; desc: string };

const PAIN_POINTS: ReadonlyArray<PainPoint> = [
  {
    emoji: '💬',
    title: '공지는 카톡, 자료는 어디에',
    desc: '카카오톡 공지는 금세 묻히고, 활동 자료는 단톡방·드라이브에 흩어져요.',
  },
  {
    emoji: '📊',
    title: '회비는 엑셀로 손이 많이 가요',
    desc: '입금 내역을 일일이 대조하고, 미납자는 따로 챙겨 연락해야 해요.',
  },
  {
    emoji: '📝',
    title: '지원·면접 관리가 제각각',
    desc: '구글폼으로 받고, 면접 시간은 댓글로 조율하고… 매번 처음부터예요.',
  },
];

export function Problem() {
  return (
    <section className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            PROBLEM · 이런 적 있죠?
          </p>
          <h2 className="mb-12 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            동아리 운영, 흩어진 도구로
            <br />
            버티고 있지 않나요?
          </h2>
        </FadeIn>

        <Stagger className="mb-12 grid gap-4 md:grid-cols-3">
          {PAIN_POINTS.map((point) => (
            <StaggerItem key={point.title} className="card p-6 shadow-1">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-md bg-sage-mist text-xl">
                {point.emoji}
              </div>
              <h3 className="mb-2 text-[16px]">{point.title}</h3>
              <p className="text-[13.5px] leading-[1.6] text-charcoal-2">{point.desc}</p>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeIn>
          <p
            className="text-center font-display font-bold text-ink-deep"
            style={{ fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: '-0.02em' }}
          >
            그래서 두잉이 하나로 모았어요.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
