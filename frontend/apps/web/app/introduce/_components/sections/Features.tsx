import type { ReactNode } from 'react';
import { FadeIn } from '@/components/motion/FadeIn';
import { Reveal } from '../motion/Reveal';
import { ExploreMockup } from '../mockups/ExploreMockup';
import { InterviewMockup } from '../mockups/InterviewMockup';
import { FeesMockup } from '../mockups/FeesMockup';
import { AdminMockup } from '../mockups/AdminMockup';

function CheckList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[14px] text-charcoal-2">
          <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-ink text-[10px] font-bold text-paper">
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

type FeatureBlockProps = {
  index: string;
  label: string;
  title: ReactNode;
  desc: string;
  items: ReadonlyArray<string>;
  visual: ReactNode;
  /** true 면 비주얼을 왼쪽으로(데스크탑) 배치해 좌우 교차. */
  reverse?: boolean;
};

function FeatureBlock({ index, label, title, desc, items, visual, reverse }: FeatureBlockProps) {
  return (
    <div className="grid items-center gap-10 border-b border-dashed border-line py-12 last:border-b-0 md:grid-cols-2 md:gap-16 md:py-16">
      {/* 텍스트는 자기 쪽에서, 비주얼은 반대쪽에서 슬라이드 진입 — 좌우 교차 리듬 강화 */}
      <Reveal x={reverse ? 40 : -40} y={0} className={reverse ? 'md:order-2' : undefined}>
        <p className="mb-3.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.2em] text-ink">
          {index} · {label}
        </p>
        <h3 className="mb-4" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>
          {title}
        </h3>
        <p className="mb-6 text-[15.5px] leading-[1.6] text-charcoal-2">{desc}</p>
        <CheckList items={items} />
      </Reveal>
      <Reveal x={reverse ? -40 : 40} y={0} delay={0.08} className={reverse ? 'md:order-1' : undefined}>
        {visual}
      </Reveal>
    </div>
  );
}

export function Features() {
  return (
    <section className="border-t border-line bg-graysoft/40 px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FEATURES · 주요 기능
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            동아리 운영의 모든 순간
          </h2>
          <p className="mb-4 max-w-[640px] text-[16.5px] text-charcoal-2">
            탐색하고, 지원받고, 면접 보고, 회비까지. 지금 두잉에서 동작하는 기능들이에요.
          </p>
        </FadeIn>

        <FeatureBlock
          index="FEATURE 01"
          label="탐색·지원"
          title={
            <>
              관심사로 동아리를 찾고
              <br />
              두잉 안에서 바로 지원
            </>
          }
          desc="8개 카테고리로 정리된 대구대 동아리를 키워드·필터로 찾고, 양식대로 지원서를 작성해요. 작성 중인 내용은 자동으로 임시 저장돼요."
          items={[
            '카테고리 필터 + 키워드 검색',
            '동아리별 양식대로 지원서 작성',
            '자동 임시 저장 — 이어서 작성 가능',
          ]}
          visual={<ExploreMockup />}
        />

        <FeatureBlock
          index="FEATURE 02"
          label="면접 운영"
          reverse
          title={
            <>
              면접 일정 조율,
              <br />
              자동으로 끝내요
            </>
          }
          desc="지원자에게 가능한 시간을 받아 라운드를 만들고, 슬롯에 맞춰 면접 일정을 자동으로 배정해요. 확정과 알림까지 한 번에."
          items={[
            '지원자 가능 시간 수합',
            '슬롯 자동 배정 + 수동 조정',
            '일정 확정·재안내 알림 발송',
          ]}
          visual={<InterviewMockup />}
        />

        <FeatureBlock
          index="FEATURE 03"
          label="회비"
          title={
            <>
              회비 청구부터
              <br />
              입금 확인까지 자동으로
            </>
          }
          desc="회비 정책을 만들어 부원에게 청구하고 납부 현황을 한눈에 봐요. 은행 입금 내역을 부원과 자동으로 맞추고, 금전출납부로 정리돼요."
          items={[
            '회비 정책·청구·납부 현황 관리',
            '은행 입금 거래 자동 매칭',
            '수입·지출 금전출납부 정리',
          ]}
          visual={<FeesMockup />}
        />

        <FeatureBlock
          index="FEATURE 04"
          label="운영 대시보드"
          reverse
          title={
            <>
              지원자 관리와 통계를
              <br />
              한 화면에서
            </>
          }
          desc="지원자를 검토·일괄 처리하고, 지원에서 합격까지 이어지는 펀넬을 통계로 확인해요. 매 학기 운영 흐름이 그대로 쌓여요."
          items={[
            '지원자 검토·상태 일괄 변경',
            '지원 → 면접 → 합격 펀넬 통계',
            '공지·일정·사진까지 한곳에서',
          ]}
          visual={<AdminMockup />}
        />
      </div>
    </section>
  );
}
