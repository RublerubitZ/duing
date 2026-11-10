import { AdminClubSignalsCard } from './AdminClubSignalsCard';
import { AdminFeeAuditCard } from './AdminFeeAuditCard';
import { AdminJobStatusCard } from './AdminJobStatusCard';
import { AdminPendingTrendCard } from './AdminPendingTrendCard';
import { AdminSchoolSyncCard } from './AdminSchoolSyncCard';
import { AdminTriageQueueCard } from './AdminTriageQueueCard';
import { AdminTriageTiles } from './AdminTriageTiles';

/**
 * 총동연 홈 대시보드 — 영역별 대기 띠 아래 [처리 대기열 → 처리 대기 추이·회비 감사 요약 → 자동 작업 | 동아리 현황·학교 반영 대기].
 * 처리할 일(대기열)과 그 흐름(추이·회비·자동 작업)이 넓은 왼쪽 칸을 채우고, 살펴볼 현황은 오른쪽 320px 칸에 둔다 —
 * 카드 다섯 장을 오른쪽에만 쌓으면 대기열이 짧은 날 왼쪽 절반이 빈다.
 * 사이드바(248px+여백)가 붙는 구간에서 본문이 좁아 두 칸은 xl 부터 나눈다. 그 아래는 DOM 순서대로 쌓인다.
 * 동아리 현황은 옛 백엔드(404)면 그리지 않아 오른쪽 칸이 학교 반영 대기부터 시작한다.
 */
export function AdminHomeDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <AdminTriageTiles />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminTriageQueueCard />
          {/* 나란한 두 카드는 높이를 맞춘다 — 카드 루트가 칸 높이를 채운다.
              md 에서는 사이드바가 붙어 본문이 416px 까지 좁아지므로 다시 한 칸으로 쌓고, lg 부터 나란히 둔다. */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <div className="min-w-0 [&>*]:h-full">
              <AdminPendingTrendCard />
            </div>
            <div className="min-w-0 [&>*]:h-full">
              <AdminFeeAuditCard />
            </div>
          </div>
          <AdminJobStatusCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AdminClubSignalsCard />
          <AdminSchoolSyncCard />
        </div>
      </div>
    </div>
  );
}
