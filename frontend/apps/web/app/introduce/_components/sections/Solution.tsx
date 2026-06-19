import { FadeIn } from '@/components/motion/FadeIn';
import { Stagger, StaggerItem } from '../motion/Stagger';

type SolutionCard = { emoji: string; title: string; desc: string };

const SOLUTIONS: ReadonlyArray<SolutionCard> = [
  {
    emoji: '🔍',
    title: '모집 관리',
    desc: '모집공고를 올리고, 지원자를 한곳에서 검토·일괄 처리해요.',
  },
  {
    emoji: '🗓️',
    title: '면접 운영',
    desc: '지원자 가능 시간을 모아 면접 일정을 자동으로 배정해요.',
  },
  {
    emoji: '💰',
    title: '회비 관리',
    desc: '회비를 청구하고 납부 현황을 확인, 은행 입금까지 자동으로 맞춰요.',
  },
  {
    emoji: '📢',
    title: '공지·일정',
    desc: '동아리 공지와 행사 일정을 부원 모두가 한 화면에서 봐요.',
  },
  {
    emoji: '👥',
    title: '멤버·권한 관리',
    desc: '부원 현황을 확인하고 운영진 역할과 회장 인계를 처리해요.',
  },
  {
    emoji: '🔔',
    title: '알림',
    desc: '모집 마감, 면접 일정 같은 중요한 순간을 알림으로 받아요.',
  },
];

export function Solution() {
  return (
    <section className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            SOLUTION · 두잉이 해결합니다
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            운영에 필요한 모든 것을
            <br />
            한 플랫폼에서
          </h2>
          <p className="mb-12 max-w-[620px] text-[16.5px] text-charcoal-2">
            흩어진 도구를 오가지 않아도 돼요. 두잉 안에서 모집부터 회비까지 이어집니다.
          </p>
        </FadeIn>

        <Stagger className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {SOLUTIONS.map((item) => (
            <StaggerItem key={item.title} className="card p-6 transition hover:shadow-2">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-md bg-sage-mist text-xl">
                {item.emoji}
              </div>
              <h3 className="mb-2 text-[17px]">{item.title}</h3>
              <p className="text-[14px] leading-[1.6] text-charcoal-2">{item.desc}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
