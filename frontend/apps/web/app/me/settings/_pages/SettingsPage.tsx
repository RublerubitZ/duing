'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { useFavoriteListQuery, useLogout, useManagedClubsQuery, useMeQuery, useMyApplicationsQuery } from '@duing/hooks';
import { GRADE_DISPLAY_NAME } from '@duing/types';

import { HomeNav } from '@/app/_components/HomeNav';
import { SparkleFull } from '@/components/duing/Sparkle';

import { MyPageHeader } from '../../_components/MyPageHeader';
import { ProfileEditDialog } from '../_components/ProfileEditDialog';
import { PasswordChangeDialog } from '../_components/PasswordChangeDialog';
import { PhoneChangeDialog } from '../_components/PhoneChangeDialog';
import { WithdrawAccountDialog } from '../_components/WithdrawAccountDialog';

/* ── Settings Row ── */
type SettingsRowProps = {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
};

function SettingsRow({ label, value, action }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-line">
      <div className="w-20 shrink-0 text-[13px] font-semibold text-charcoal-2 sm:w-[140px]">{label}</div>
      <div className="min-w-0 flex-1 text-[14.5px] text-ink-deep font-medium">{value}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ── Settings Card ── */
type SettingsCardProps = {
  title: string;
  hint?: string;
  children: React.ReactNode;
  danger?: boolean;
};

function SettingsCard({ title, hint, children, danger = false }: SettingsCardProps) {
  return (
    <section className="bg-paper rounded-lg border border-line mb-4 overflow-hidden">
      <div
        className="px-7 py-5 border-b border-line"
        style={danger ? { background: 'rgba(217,119,87,0.05)' } : undefined}
      >
        <h3 className="text-[17px] font-body font-bold text-ink-deep">{title}</h3>
        {hint && <p className="text-[12.5px] text-charcoal-3 mt-1">{hint}</p>}
      </div>
      <div className="px-7 py-2">{children}</div>
    </section>
  );
}

/* ── Settings Page tabs ── */
const TAB_LABELS = ['프로필 정보', '계정 보안', '알림 설정', '계정'] as const;

function SettingsPageTabs() {
  const [activeTab, setActiveTab] = useState<(typeof TAB_LABELS)[number]>('프로필 정보');

  return (
    <nav className="border-b border-line px-4 sm:px-6 md:px-10 pt-4">
      <div className="max-w-layout mx-auto flex gap-6 flex-wrap items-center">
        <Link
          href="/me"
          className="btn btn-ghost btn-sm px-2.5 py-1.5 text-[13px] flex items-center gap-1"
        >
          ← 마이페이지로
        </Link>
        {TAB_LABELS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-4 bg-transparent border-none text-[15px] font-semibold cursor-pointer transition-colors duration-150 -mb-px ${
                isActive
                  ? 'text-ink border-b-[2.5px] border-ink'
                  : 'text-charcoal-3 border-b-[2.5px] border-transparent hover:text-charcoal'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Settings Page ── */
export function SettingsPage() {
  const meQuery = useMeQuery();
  const applicationsQuery = useMyApplicationsQuery();
  const managedClubsQuery = useManagedClubsQuery();
  const favoriteListQuery = useFavoriteListQuery(0, 20);
  const logout = useLogout();
  const router = useGuardedRouter();

  const user = meQuery.data;
  const applyCount = applicationsQuery.data?.length ?? 0;
  const joinedCount = managedClubsQuery.data?.length ?? 0;
  const savedCount = favoriteListQuery.data?.content.length ?? 0;

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <div className="duing bg-cream min-h-dvh">
      <HomeNav slimOnMobile />
      <MyPageHeader
        name={user?.name ?? '—'}
        studentId={user?.studentId ?? '—'}
        applyCount={applyCount}
        joinedCount={joinedCount}
        savedCount={savedCount}
      />
      <SettingsPageTabs />

      <section className="px-4 sm:px-6 md:px-10 py-8 pb-20">
        <div className="max-w-[880px] mx-auto">

          <SettingsCard
            title="프로필 정보"
            hint="공개 프로필과 운영자 알림에 사용됩니다."
          >
            <SettingsRow
              label="이름"
              value={user?.name ?? '—'}
              action={
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  disabled={!user}
                  className="btn btn-ghost btn-sm"
                >
                  수정
                </button>
              }
            />
            <SettingsRow label="학번" value={user?.studentId ?? '—'} />
            <SettingsRow label="학년" value={user?.grade ? GRADE_DISPLAY_NAME[user.grade] : '—'} />
            <SettingsRow
              label="전화번호"
              value={user?.phone ?? '—'}
              action={
                <button
                  type="button"
                  onClick={() => setPhoneOpen(true)}
                  disabled={!user}
                  className="btn btn-ghost btn-sm"
                >
                  변경
                </button>
              }
            />
          </SettingsCard>

          <SettingsCard title="계정 보안">
            <SettingsRow
              label="비밀번호"
              value={
                <span className="font-mono tracking-[0.2em]">••••••••</span>
              }
              action={
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="btn btn-secondary btn-sm"
                >
                  변경하기
                </button>
              }
            />
          </SettingsCard>

          <SettingsCard title="알림 설정">
            <div className="py-6 text-center">
              <p className="text-sm font-semibold text-ink-deep">알림 설정은 준비 중이에요</p>
              <p className="mt-1 text-[12.5px] text-charcoal-3">
                지금은 앱 안에서 알림을 확인할 수 있어요. 채널별 알림 설정은 곧 제공할게요.
              </p>
            </div>
          </SettingsCard>

          <SettingsCard title="계정" danger hint="세션 종료와 계정 삭제는 한 번 더 확인 후 진행됩니다.">
            <div className="py-5 flex gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-secondary btn-big flex-1 rounded-[14px] justify-center"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                로그아웃
              </button>
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                className="btn btn-ghost btn-big rounded-[14px] text-coral"
                style={{ border: '1px solid rgba(217,119,87,0.3)' }}
              >
                회원 탈퇴
              </button>
            </div>
          </SettingsCard>

          {/* 설정 섹션 링크 CTA */}
          <div
            className="relative overflow-hidden rounded-[24px] px-6 py-6 sm:px-8 sm:py-7 flex items-center gap-6 justify-between"
            style={{ background: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)' }}
          >
            <SparkleFull
              size={48}
              color="rgba(157,182,160,0.35)"
              className="absolute top-4 right-[240px] pointer-events-none hidden sm:block"
            />
            <div className="relative z-[1]">
              <div className="text-[11.5px] font-bold text-sage tracking-wide16 mb-1.5">SETTINGS</div>
              <div className="text-[19px] font-bold text-white mb-1">
                전체 설정 페이지로 이동해서 자세히 관리해요
              </div>
              <div className="text-[12.5px] text-white/70">
                프로필 편집, 알림 세부 설정, 비밀번호 변경, 로그아웃, 회원 탈퇴까지 한 번에.
              </div>
            </div>
          </div>

          <p className="text-[12px] text-charcoal-3 text-center py-4 leading-relaxed">
            두잉 v2.4.0 · 마지막 업데이트 2026.05.26
            <br />
            문의: duing.official@gmail.com
          </p>
        </div>
      </section>

      <ProfileEditDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        currentName={user?.name ?? ''}
        currentGrade={user?.grade ?? 'FRESHMAN'}
      />
      <PasswordChangeDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <PhoneChangeDialog open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      <WithdrawAccountDialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}
