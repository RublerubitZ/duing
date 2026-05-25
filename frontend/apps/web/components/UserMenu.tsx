'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuthStore } from '@duing/stores';
import { useLogout, useMeQuery } from '@duing/hooks';

const MENU_ITEMS = [
  { label: '마이페이지', href: '/me' },
  { label: '설정', href: '/me/settings' },
] as const;

export function UserMenu() {
  const status = useAuthStore((state) => state.status);
  const meQuery = useMeQuery();
  const logout = useLogout();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (status !== 'authenticated') return null;

  const userName = meQuery.data?.name ?? '회원';
  const initial = userName.slice(-2).charAt(0);

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    router.refresh();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-3 pr-1.5 text-[13px] font-bold text-ink hover:border-ink"
      >
        {userName}님
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
          {initial}
        </span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[160px] overflow-hidden rounded-[14px] border border-line bg-paper"
          style={{ boxShadow: 'var(--shadow-3)' }}
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center border-b border-line px-4 py-3 text-[13.5px] font-semibold text-ink-deep transition-colors hover:bg-sage-tint"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center px-4 py-3 text-[13.5px] font-bold text-coral transition-colors hover:bg-sage-tint"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
