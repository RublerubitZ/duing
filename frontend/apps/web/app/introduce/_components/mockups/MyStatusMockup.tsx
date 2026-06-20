import { Bell, Heart } from 'lucide-react';

type MyApplication = { club: string; cat: string; status: '지원완료' | '면접확정' | '합격' };

const MY_APPLICATIONS: ReadonlyArray<MyApplication> = [
  { club: '두잉코드', cat: 'IT', status: '면접확정' },
  { club: 'STAT 통계학회', cat: '학술', status: '지원완료' },
  { club: '트레몰로', cat: '음악', status: '합격' },
];

function statusClass(status: MyApplication['status']): string {
  if (status === '합격') return 'pill-sky';
  if (status === '면접확정') return 'pill';
  return 'pill-outline';
}

/** 내 지원 현황 — 지원한 동아리 상태와 알림을 한곳에서 보는 학생 관점 미리보기. */
export function MyStatusMockup() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-bold text-ink-deep">내 지원 현황</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink">
          <Heart size={13} strokeWidth={1.75} aria-hidden />
          관심 5
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {MY_APPLICATIONS.map((application) => (
          <div
            key={application.club}
            className="flex items-center justify-between rounded-md border border-line bg-cream px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-charcoal">{application.club}</div>
              <div className="mt-0.5 font-mono text-[11px] text-charcoal-3">{application.cat}</div>
            </div>
            <span className={`pill ${statusClass(application.status)} text-[11px]`}>
              {application.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-line bg-cream px-3 py-2 text-[12.5px] text-charcoal-2">
        <Bell size={14} strokeWidth={1.75} className="text-ink" aria-hidden />
        두잉코드 면접이 내일 오후 1:30에 있어요
      </div>
    </div>
  );
}
