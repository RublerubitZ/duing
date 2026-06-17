'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { ArrowRight } from '@/components/duing/Icon';

type MenuItem = {
  icon: string;
  label: string;
  description: string;
  href: Route;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: '▦', label: '내 두잉',    description: '지원 현황·찜한 동아리', href: '/me' },
  { icon: '♡', label: '찜한 동아리', description: '8곳',               href: '/me/favorites' },
  { icon: '📋', label: '지원 현황',  description: '진행 중인 지원',       href: '/me/applications' },
  { icon: '💳', label: '내 회비',    description: '청구된 회비 내역',     href: '/me/fees' },
  { icon: '⚙',  label: '설정',       description: '프로필·알림·계정',    href: '/me/settings' },
];

type Props = {
  name: string;
  department?: string;
  onLogout: () => void;
};

export function NavDropdown({ name, department, onLogout }: Props) {
  const initial = name.slice(0, 2);

  return (
    <div className="absolute top-[calc(100%+8px)] right-0 w-[280px] bg-paper rounded-[16px] border border-line overflow-hidden z-10"
      style={{ boxShadow: 'var(--shadow-3)' }}
    >
      {/* Profile header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-line bg-sage-tint">
        <div className="w-10 h-10 rounded-[12px] bg-ink text-paper grid place-items-center font-display text-[16px] font-bold">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-ink-deep">{name}</div>
          {department && (
            <div className="text-[11px] text-charcoal-3 truncate">{department}</div>
          )}
        </div>
      </div>

      {/* Menu items */}
      {MENU_ITEMS.map((item, index) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-semibold border-b border-line transition-colors hover:bg-sage-tint"
          style={{ background: index === 1 ? 'var(--sage-tint)' : undefined }}
        >
          <span className="w-[18px] text-center text-charcoal-2">{item.icon}</span>
          <span className="flex-1 text-ink-deep">{item.label}</span>
          <span className="text-[11px] text-charcoal-3 font-medium">{item.description}</span>
          <ArrowRight size={14} className="text-charcoal-3" />
        </Link>
      ))}

      {/* Logout */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-4 py-3 text-[13.5px] font-bold text-coral transition-colors"
        style={{ background: 'rgba(217,119,87,0.05)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        로그아웃
      </button>
    </div>
  );
}
