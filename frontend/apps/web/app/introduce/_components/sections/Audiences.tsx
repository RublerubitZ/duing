import { Check } from '@/components/duing/Icon';
import { FadeIn } from '@/components/motion/FadeIn';
import { Stagger, StaggerItem } from '../motion/Stagger';

type Audience = {
  tag: string;
  title: string;
  lead: string;
  features: ReadonlyArray<string>;
};

const AUDIENCES: ReadonlyArray<Audience> = [
  {
    tag: '운영진을 위해',
    title: '운영에 쓰는 시간은 줄이고, 활동에 집중해요',
    lead: '회장단이 노션·구글폼·엑셀로 나눠 쓰던 일을 두잉 한곳에 모았어요.',
    features: [
      '지원자 검토 · 면접 일정 · 합격 처리',
      '공지 작성 · 행사 일정 · 사진 관리',
      '회비 청구 · 납부 확인 · 은행 매칭',
      '멤버 역할 · 권한 · 회장 인계',
    ],
  },
  {
    tag: '부원을 위해',
    title: '관심 있는 동아리, 한눈에 따라가요',
    lead: '탐색부터 지원, 활동까지 흩어진 정보를 찾아다닐 필요 없어요.',
    features: [
      '모집 일정 캘린더로 확인',
      '지원 현황 · 면접 일정 추적',
      '동아리 공지 한 화면에서',
      '회비 납부 내역 · 알림 수신',
    ],
  },
];

export function Audiences() {
  return (
    <section className="border-t border-line px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FOR EVERYONE · 두 개의 시선
          </p>
          <h2 className="mb-12 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            운영하는 사람도,
            <br />
            활동하는 사람도
          </h2>
        </FadeIn>

        <Stagger className="grid gap-6 md:grid-cols-2" gap={0.1}>
          {AUDIENCES.map((audience) => (
            <StaggerItem key={audience.tag} className="card p-7 shadow-1 md:p-9">
              <span className="pill mb-5">{audience.tag}</span>
              <h3 className="mb-2.5 text-[21px] leading-snug">{audience.title}</h3>
              <p className="mb-6 text-[14.5px] leading-[1.6] text-charcoal-2">{audience.lead}</p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {audience.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-[14.5px] text-charcoal">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage-mist text-ink">
                      <Check size={12} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
