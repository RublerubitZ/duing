'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { HomeNav } from '../../../_components/HomeNav';
import { MyPageHeader } from '../../_components/MyPageHeader';
import { Icon } from '../../_components/Icons';
import { SettingsCard } from '../_components/SettingsCard';
import { SettingsRow } from '../_components/SettingsRow';
import { ToggleRow } from '../_components/ToggleRow';

const SETTINGS_TABS = ['프로필 정보', '계정 보안', '알림 설정', '계정'] as const;

function SettingsPageTabs() {
  return (
    <section className="px-10 pt-4 pb-0 border-b border-line">
      <div className="max-w-layout mx-auto flex gap-6 flex-wrap items-center">
        <Link href="/me" className="btn btn-ghost btn-sm px-2.5 py-1.5">
          <Icon.arrowLeft />
          마이페이지로
        </Link>
        {SETTINGS_TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={[
              'py-4 bg-none border-none -mb-[1.5px] text-[15px] font-semibold font-body cursor-pointer',
              index === 0
                ? 'text-ink border-b-[2.5px] border-ink'
                : 'text-charcoal-3 border-b-[2.5px] border-transparent',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MySettingsPage() {
  const router = useRouter();

  const handleLogout = () => {
    router.push('/');
  };

  return (
    <div className="bg-cream min-h-screen">
      <HomeNav />
      <MyPageHeader />
      <SettingsPageTabs />

      <section className="px-10 pt-8 pb-20">
        <div className="max-w-[880px] mx-auto">
          <SettingsCard
            title="프로필 정보"
            hint="공개 프로필과 운영자 알림에 사용됩니다."
          >
            <SettingsRow
              label="이름"
              value="김도윤"
              action={<button type="button" className="btn btn-ghost btn-sm">수정</button>}
            />
            <SettingsRow label="학번" value="2021123456" />
            <SettingsRow
              label="학과"
              value="IT융합대학 · 컴퓨터공학과"
              action={<button type="button" className="btn btn-ghost btn-sm">변경 요청</button>}
            />
            <SettingsRow
              label="학년"
              value="2학년 (재학)"
              action={<button type="button" className="btn btn-ghost btn-sm">수정</button>}
            />
            <SettingsRow
              label="전화번호"
              value="010-2345-6789"
              action={<button type="button" className="btn btn-ghost btn-sm">수정</button>}
            />
            <div className="flex items-center gap-4 py-4">
              <div className="w-[140px] text-[13px] font-semibold text-charcoal-2">이메일</div>
              <div className="flex-1 text-[14.5px] text-ink-deep font-medium flex items-center gap-2">
                2021123456@daegu.ac.kr
                <span className="text-[10.5px] font-bold px-[7px] py-0.5 rounded-full bg-sage-mist text-ink-deep">
                  인증완료
                </span>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="계정 보안">
            <SettingsRow
              label="비밀번호"
              value={
                <span className="font-mono tracking-[0.2em]">••••••••</span>
              }
              action={<button type="button" className="btn btn-secondary btn-sm">변경하기</button>}
            />
            <div className="flex items-center gap-4 py-4">
              <div className="w-[140px] text-[13px] font-semibold text-charcoal-2">최근 로그인</div>
              <div className="flex-1">
                <div className="text-[13.5px] text-ink-deep">Chrome · macOS · 대구</div>
                <div className="text-[12px] text-charcoal-3 font-mono">2025.09.19 14:08</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm">접속 기기 관리</button>
            </div>
          </SettingsCard>

          <SettingsCard
            title="알림 설정"
            hint="중요한 일정은 항상 카톡으로도 한 번 더 보내드려요."
          >
            <ToggleRow label="지원 결과 알림"          hint="서류 결과 · 면접 일정 · 합격 발표"  defaultOn />
            <ToggleRow label="찜한 동아리 마감 임박 알림" hint="모집 마감 3일 전 알림"              defaultOn />
            <ToggleRow label="가입한 동아리 모임 알림"  hint="다음 모임 24시간 전"                defaultOn />
            <ToggleRow label="공지·이벤트 소식"         hint="박람회 · 학생자치회 안내"           defaultOn={false} />
            <ToggleRow label="제휴 혜택·마케팅 알림"    hint="제휴 매장 할인 등"                  defaultOn={false} />
          </SettingsCard>

          <SettingsCard title="계정" danger>
            <div className="flex gap-3 py-5">
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-secondary btn-big flex-1 rounded-md justify-center"
              >
                <Icon.logout />
                로그아웃
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-big rounded-md text-coral border border-[rgba(217,119,87,0.3)]"
              >
                회원 탈퇴
              </button>
            </div>
          </SettingsCard>

          <div className="text-[12px] text-charcoal-3 text-center py-4 leading-relaxed">
            두잉 v2.4.0 · 마지막 업데이트 2025.09.18
            <br />
            문의: support@duing.daegu.ac.kr
          </div>
        </div>
      </section>
    </div>
  );
}
