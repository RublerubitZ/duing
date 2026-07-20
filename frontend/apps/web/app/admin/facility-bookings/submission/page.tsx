import { redirect } from 'next/navigation';

// v3 단일 페이지 통합(스펙 §7.0) — 구경로는 준비 탭으로 보낸다. Batch 상세(PR-4b)는 하위 경로로 유지 예정.
export default function Page() {
  redirect('/admin/facility-bookings?tab=prepare');
}
