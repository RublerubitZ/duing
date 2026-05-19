import { SparkleFull } from '../../../_components/Sparkle';
import { SectionHeader } from '../SectionHeader';
import { Icon } from '../Icons';

type Props = {
  onGoToSettings: () => void;
};

export function SectionSettingsSummary({ onGoToSettings }: Props) {
  return (
    <section
      data-section="settings"
      id="sec-settings"
      className="px-10 pt-8 pb-20 scroll-mt-[60px]"
    >
      <div className="max-w-layout mx-auto">
        <SectionHeader
          title="설정"
          hint="프로필 · 알림 · 계정 보안 설정을 한 곳에서 관리해요."
        />

        <div className="relative overflow-hidden bg-gradient-to-br from-ink to-ink-deep text-white rounded-[24px] px-8 py-7 flex items-center gap-6 justify-between">
          <SparkleFull
            size={48}
            color="rgba(157,182,160,0.35)"
            className="absolute top-4 right-[240px] pointer-events-none"
          />
          <div className="relative z-10">
            <div className="text-[11.5px] font-bold text-sage tracking-wide16 mb-1.5">SETTINGS</div>
            <div className="text-[19px] font-bold text-white mb-1">
              전체 설정 페이지로 이동해서 자세히 관리해요
            </div>
            <div className="text-[12.5px] text-white/70">
              프로필 편집, 알림 세부 설정, 비밀번호 변경, 로그아웃, 회원 탈퇴까지 한 번에.
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToSettings}
            className="relative z-10 whitespace-nowrap inline-flex items-center gap-2 px-[22px] py-3.5 rounded-md bg-sage text-ink-deep text-[14px] font-bold border-none transition-[transform,background] duration-[180ms] hover:-translate-y-px hover:bg-[#B6C9B9]"
          >
            설정 이동하기
            <Icon.arrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}
