import type { Metadata } from 'next';
import { CalendarPage } from './_pages/CalendarPage';

export const metadata: Metadata = { title: '캠퍼스 일정 | 두잉' };

export default function Page() {
  return <CalendarPage />;
}
