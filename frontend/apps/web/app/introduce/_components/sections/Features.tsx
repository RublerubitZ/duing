import { FadeIn } from '@/components/motion/FadeIn';
import { FeatureRow } from '../FeatureRow';
import { AdminMockup } from '../mockups/AdminMockup';
import { FeesMockup } from '../mockups/FeesMockup';
import { InterviewMockup } from '../mockups/InterviewMockup';

export function Features() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-layout px-4 sm:px-6 md:px-10">
        <FadeIn>
          <p className="mb-4 tabular-nums text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FOR LEADERS · 운영진을 위한 기능
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            운영에 쓰는 시간은 줄이고,
            <br />
            활동에 집중해요
          </h2>
          <p className="mb-4 max-w-[640px] text-[16.5px] text-charcoal-2">
            지원자 관리, 면접, 회비까지. 노션·구글폼·엑셀로 나눠 쓰던 일을 두잉 한곳에 모았어요.
          </p>
        </FadeIn>

        <FadeIn>
          <FeatureRow
            index="FEATURE 01"
            label="면접 운영"
            title={
              <>
                면접 일정 조율,
                <br />
                자동으로 끝내요
              </>
            }
            desc="지원자에게 가능한 시간을 받아 라운드를 만들고, 슬롯에 맞춰 면접 일정을 자동으로 배정해요. 확정과 알림까지 한 번에."
            items={['지원자 가능 시간 수합', '슬롯 자동 배정 + 수동 조정', '일정 확정·재안내 알림 발송']}
            visual={<InterviewMockup />}
          />
        </FadeIn>

        <FadeIn>
          <FeatureRow
            reverse
            index="FEATURE 02"
            label="회비"
            title={
              <>
                회비 청구부터
                <br />
                입금 확인까지 자동으로
              </>
            }
            desc="회비 정책을 만들어 부원에게 청구하고 납부 현황을 한눈에 봐요. 은행 입금 내역을 부원과 자동으로 맞추고, 금전출납부로 정리돼요."
            items={['회비 정책·청구·납부 현황 관리', '은행 입금 거래 자동 매칭', '수입·지출 금전출납부 정리']}
            visual={<FeesMockup />}
          />
        </FadeIn>

        <FadeIn>
          <FeatureRow
            index="FEATURE 03"
            label="운영 대시보드"
            title={
              <>
                지원자 관리와 통계를
                <br />
                한 화면에서
              </>
            }
            desc="지원자를 검토·일괄 처리하고, 지원에서 합격까지 이어지는 펀넬을 통계로 확인해요. 공지·일정·멤버 관리까지 그대로 쌓여요."
            items={['지원자 검토·상태 일괄 변경', '지원 → 면접 → 합격 펀넬 통계', '공지·일정·멤버·권한 관리']}
            visual={<AdminMockup />}
          />
        </FadeIn>
      </div>
    </section>
  );
}
