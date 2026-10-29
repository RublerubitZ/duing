import { AdminFeeAuditCard } from './AdminFeeAuditCard';
import { AdminSchoolSyncCard } from './AdminSchoolSyncCard';
import { AdminTriageQueueCard } from './AdminTriageQueueCard';
import { AdminTriageTiles } from './AdminTriageTiles';

/**
 * 총동연 홈 대시보드 — 영역별 대기 칸 아래 [처리 대기열 | 회비 감사 요약·학교 반영 대기].
 * 사이드바(248px+여백)가 붙는 구간에서 본문이 좁아 두 칸은 xl 부터 나눈다. 그 아래는 DOM 순서대로 쌓인다.
 */
export function AdminHomeDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <AdminTriageTiles />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <AdminTriageQueueCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AdminFeeAuditCard />
          <AdminSchoolSyncCard />
        </div>
      </div>
    </div>
  );
}
