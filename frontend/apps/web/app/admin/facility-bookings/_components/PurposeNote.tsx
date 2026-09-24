'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const STORAGE_KEY = 'duing:admin:purpose-note:collapsed';

// 접힘 상태 외부 스토어(스펙 E3) — localStorage 가 원본이고, 저장이 막힌 환경(차단·용량)에서는 메모리 값으로 대체한다.
// useState 초기값으로 localStorage 를 읽으면 SSR(펼침)과 클라 첫 렌더(접힘)가 달라 하이드레이션 경고가 나므로
// useSyncExternalStore 의 서버 스냅샷을 항상 펼침으로 두고 마운트 뒤에 저장값을 반영한다(useOnlineStatus 관례).
const listeners = new Set<() => void>();
let memoryFallback: boolean | null = null;

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

// 메모리 값은 이 세션에서 마지막으로 쓴 값(항상 미러). 저장이 막힌 환경(setItem 실패·getItem 실패 모두)에서도
// 토글이 먹게 하려고 읽기는 메모리를 우선한다. 모듈 상태라 테스트 사이에 남는다 — "저장값으로 마운트" 를 검증하는
// 테스트는 `vi.resetModules()` + 동적 import 로 모듈을 새로 받아야 한다(테스트 파일 상단 주석에 명시).
function readCollapsed(): boolean {
  if (memoryFallback !== null) return memoryFallback;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // localStorage 차단 — 기본 펼침
  }
}

function writeCollapsed(collapsed: boolean) {
  memoryFallback = collapsed;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // 저장 실패 — 메모리 값으로 이 세션 동안만 유지
  }
  listeners.forEach((notify) => notify());
}

function getServerSnapshot(): boolean {
  return false;
}

/** 화면 목적 안내 배너(목업 PurposeNote) — sage-mist 카드 + 인포 아이콘 + 13px 본문. 접기 상태는 브라우저에 기억한다. */
export function PurposeNote({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, getServerSnapshot);

  return (
    <div className="flex items-start gap-2.5 rounded-[12px] bg-sage-mist px-4 py-[13px] text-[13px] leading-normal text-ink-deep">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px h-[17px] w-[17px] shrink-0 text-ink"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      {/* 접힌 상태는 한 줄 — 본문 대신 펼치기 버튼만 남긴다(숙련 운영진의 세로 공간 절약). */}
      {collapsed ? (
        <button
          type="button"
          aria-expanded={!collapsed}
          className="flex-1 text-left font-semibold text-ink underline-offset-2 hover:underline"
          onClick={() => writeCollapsed(false)}
        >
          화면 안내 보기
        </button>
      ) : (
        <>
          <div className="flex-1">{children}</div>
          <button
            type="button"
            aria-expanded={!collapsed}
            className="shrink-0 text-xs font-semibold text-charcoal-3 hover:text-ink"
            onClick={() => writeCollapsed(true)}
          >
            접기
          </button>
        </>
      )}
    </div>
  );
}
