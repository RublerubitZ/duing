import { CalendarDays, Link2, type LucideIcon, Search } from 'lucide-react';
import { FadeIn } from '@/components/motion/FadeIn';
import { Stagger, StaggerItem } from '../motion/Stagger';

type PainPoint = { icon: LucideIcon; title: string; desc: string };

const PAIN_POINTS: ReadonlyArray<PainPoint> = [
  {
    icon: Search,
    title: '어떤 동아리가 있는지 몰라요',
    desc: '에브리타임·인스타·과 단톡에 흩어진 정보를 일일이 찾아다녀야 했어요.',
  },
  {
    icon: CalendarDays,
    title: '모집 기간을 놓쳤어요',
    desc: '공고가 올라온지도 모르고 지나가 버린 적이 한두 번이 아니에요.',
  },
  {
    icon: Link2,
    title: '지원 절차가 제각각이에요',
    desc: '구글폼·인스타 DM·방문 신청… 동아리마다 매번 새로 알아봐야 했어요.',
  },
];

export function Problem() {
  return (
    <section className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FOR STUDENTS · 동아리를 찾고 있나요?
          </p>
          <h2 className="mb-12 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            관심 가는 동아리,
            <br />
            찾기 번거롭지 않았나요?
          </h2>
        </FadeIn>

        <Stagger className="mb-12 grid gap-4 md:grid-cols-3">
          {PAIN_POINTS.map((point) => (
            <StaggerItem key={point.title} className="card p-6 shadow-1">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-md bg-sage-mist text-ink">
                <point.icon size={20} strokeWidth={1.75} aria-hidden />
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
            두잉 하나면 충분합니다.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
