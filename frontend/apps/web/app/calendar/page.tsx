import type { Metadata } from 'next';
import { todayKstDateString } from '@duing/hooks/datetime';
import { CalendarPage } from './_pages/CalendarPage';

export const metadata: Metadata = { title: '캠퍼스 일정 | 두잉' };

export default function Page() {
  // 서버가 그린 날 — 정적 프리렌더라 빌드 시각의 KST 날짜다. CalendarPage 가 하이드레이션 프레임의 "오늘"로 쓴다.
  return <CalendarPage renderedTodayIso={todayKstDateString(new Date())} />;
}
