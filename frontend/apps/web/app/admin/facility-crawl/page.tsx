import { redirect } from 'next/navigation';

// 크롤 예약 현황은 시설 예약 관리의 5번째 탭으로 흡수(동아리 중심 보기 스펙 §3) — 구 URL 호환 redirect.
export default function Page() {
  redirect('/admin/facility-bookings?tab=crawl');
}
