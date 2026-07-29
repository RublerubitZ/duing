import { FadeIn } from '@/components/motion/FadeIn';
import { FeatureRow } from '../FeatureRow';
import { CalendarMockup } from '../mockups/CalendarMockup';
import { ExploreMockup } from '../mockups/ExploreMockup';
import { MyStatusMockup } from '../mockups/MyStatusMockup';

export function StudentExperience() {
  return (
    <section className="bg-graysoft/40 px-4 py-20 sm:px-6 md:px-10 md:py-28">
      <div className="mx-auto max-w-layout">
        <FadeIn>
          <p className="mb-4 font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink">
            FOR STUDENTS · 동아리 탐색 경험
          </p>
          <h2 className="mb-3 max-w-[760px]" style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
            관심 있는 동아리를
            <br />
            더 쉽게 발견하고 참여해요
          </h2>
          <p className="mb-4 max-w-[640px] text-[16.5px] text-charcoal-2">
            여기저기 찾아다닐 필요 없이, 탐색부터 지원·면접·활동까지 두잉 안에서 이어져요.
          </p>
        </FadeIn>

        <FadeIn>
          <FeatureRow
            index="탐색"
            label="모집 중인 동아리"
            title={
              <>
                어떤 동아리가 있는지
                <br />
                한눈에 둘러봐요
              </>
            }
            desc="8개 카테고리로 정리된 대구대 동아리를 키워드·요일·단과대로 필터링해서, 나에게 맞는 곳을 빠르게 찾을 수 있어요."
            items={['카테고리 필터 + 키워드 검색', '활동 소개·사진으로 분위기 파악', '관심 동아리는 찜으로 저장']}
            visual={<ExploreMockup />}
          />
        </FadeIn>

        <FadeIn>
          <FeatureRow
            reverse
            index="일정"
            label="모집 캘린더"
            title={
              <>
                모집 기간,
                <br />
                이제 놓치지 않아요
              </>
            }
            desc="흩어진 공고를 찾아다니지 않아도 돼요. 모집 일정을 캘린더에서 한눈에 보고, 마감 전에 알림으로 챙겨요."
            items={['전체 모집 일정 캘린더', '마감 임박 동아리 한눈에', '지원은 두잉 안에서 바로']}
            visual={<CalendarMockup />}
          />
        </FadeIn>

        <FadeIn>
          <FeatureRow
            index="현황"
            label="지원 그 이후"
            title={
              <>
                지원하고 나서도
                <br />
                한눈에 따라가요
              </>
            }
            desc="지원서가 어디까지 진행됐는지, 면접 일정은 언제인지 두잉에서 확인해요. 공지와 회비 내역까지 한 화면에 모여요."
            items={['지원 현황·면접 일정 추적', '동아리 공지·일정 확인', '회비 납부 내역·알림 수신']}
            visual={<MyStatusMockup />}
          />
        </FadeIn>
      </div>
    </section>
  );
}
