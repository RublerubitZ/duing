import {
  Bell,
  CalendarCheck,
  Compass,
  FileText,
  type LucideIcon,
  Megaphone,
  Wallet,
} from 'lucide-react';
import { FadeIn } from '@/components/motion/FadeIn';
import { Stagger, StaggerItem } from '../motion/Stagger';

type SolutionCard = { icon: LucideIcon; title: string; desc: string; tag: '학생' | '운영진' | '공통' };

const SOLUTIONS: ReadonlyArray<SolutionCard> = [
  { icon: Compass, title: '동아리 탐색', desc: '관심사로 모집 중인 동아리를 찾아요.', tag: '학생' },
  { icon: FileText, title: '간편 지원', desc: '양식대로 지원서를 쓰고 자동 저장돼요.', tag: '학생' },
  { icon: Megaphone, title: '모집 관리', desc: '공고를 올리고 지원자를 한곳에서 관리해요.', tag: '운영진' },
  { icon: CalendarCheck, title: '면접 운영', desc: '가능 시간을 모아 일정을 자동 배정해요.', tag: '운영진' },
  { icon: Wallet, title: '회비 관리', desc: '청구·납부에 은행 입금 매칭까지 자동으로.', tag: '운영진' },
  { icon: Bell, title: '공지 · 알림', desc: '공지와 중요한 일정을 알림으로 받아요.', tag: '공통' },
];

export function Solution() {
  return (
    <section className="px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 tabular-nums text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            SOLUTION · 두잉이 모았어요
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            학생도, 운영진도
            <br />
            두잉 하나로
          </h2>
          <p className="mb-12 max-w-[620px] text-[16.5px] text-charcoal-2">
            좋은 동아리를 발견하고, 쉽게 참여하고, 편하게 운영해요. 흩어진 도구를 오갈 필요 없이 한 플랫폼에서.
          </p>
        </FadeIn>

        <Stagger className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {SOLUTIONS.map((item) => (
            <StaggerItem key={item.title} className="card p-6 transition hover:shadow-2">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-sage-mist text-ink">
                  <item.icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="pill pill-outline text-[10.5px]">{item.tag}</span>
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
