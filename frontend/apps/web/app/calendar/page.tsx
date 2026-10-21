import type { Metadata } from 'next';
import { toLocalIsoDate } from './_lib/localIsoDate';
import { CalendarPage } from './_pages/CalendarPage';

export const metadata: Metadata = { title: '캠퍼스 일정 | 두잉' };

export default function Page() {
  // 정적 프리렌더라 빌드한 날이다 — 브라우저가 하이드레이션 프레임을 서버 HTML 과 같게 그리는 데만 쓴다(CalendarPage 주석).
  return <CalendarPage renderedTodayIso={toLocalIsoDate(new Date())} />;
}
