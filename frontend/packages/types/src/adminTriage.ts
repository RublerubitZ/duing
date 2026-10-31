import type { ReportReasonCode, ReportTargetType } from './admin';
import type { BookingStatus } from './facility';
import type { FederationInquiryStatus } from './federationInquiry';

/** 총동연 홈 처리 대기열의 영역. 칸 키와 같다(동아리 승인은 pending-counts clubApproval, 운영 중단 미결은 inactiveClubPending). */
export type AdminTriageArea =
  | 'REPORT'
  | 'INQUIRY'
  | 'FACILITY'
  | 'RECRUITMENT'
  | 'PROMOTION'
  | 'SUCCESSION'
  | 'CLUB_APPROVAL'
  | 'INACTIVE_CLUB';

/**
 * 대기열 한 행 — 식별자·대기 시작 시각·표시용 원자료만 담고 href·문구는 web 이 만든다.
 * waitingSince 는 서버 시각 문자열 그대로이고, 비교는 parseKstInstant 로 한다(오프셋 없는 값은 KST).
 */
export type AdminTriageItem =
  | {
      area: 'REPORT';
      id: number;
      waitingSince: string;
      targetType: ReportTargetType;
      targetLabel: string;
      reasonCode: ReportReasonCode;
    }
  | { area: 'INQUIRY'; id: number; waitingSince: string; title: string; status: FederationInquiryStatus }
  | {
      area: 'FACILITY';
      id: number;
      waitingSince: string;
      /** 삭제된 동아리면 빈 문자열 — 표시는 web 이 대체한다 */
      clubName: string;
      roomName: string;
      /** yyyy-MM-dd */
      date: string;
      startTime: string;
      endTime: string;
      status: BookingStatus;
    }
  | {
      area: 'RECRUITMENT';
      id: number;
      /** 가장 오래된 미처리 지원서의 제출 시각 */
      waitingSince: string;
      clubName: string;
      title: string;
      pendingApplicationCount: number;
    }
  | { area: 'PROMOTION'; id: number; waitingSince: string; clubName: string; title: string }
  | { area: 'SUCCESSION'; id: number; waitingSince: string; clubName: string; requesterName: string }
  | { area: 'CLUB_APPROVAL'; id: number; /** 승인 대기에 들어온 시각 */ waitingSince: string; clubName: string }
  | {
      area: 'INACTIVE_CLUB';
      id: number;
      /** 운영 중단으로 바뀐 시각(statusChangedAt) */
      waitingSince: string;
      clubName: string;
      undecidedApplicationCount: number;
      pendingJoinRequestCount: number;
    };

/** 영역 하나의 목록 상태 — 상태별로 나뉜 하위 목록(문의·시설)과 끝 페이지를 묶은 결과. */
export type AdminTriageAreaState = {
  status: 'loading' | 'error' | 'ready';
  /** 받은 행 수(성공한 하위 목록 기준) */
  rowCount: number;
  /** 받은 행 중 가장 이른 대기 시작 시각. 행이 없으면 null */
  oldestWaitingSince: string | null;
};

export type AdminTriageQueue = {
  /** 오래 기다린 순 상위 10건 */
  items: AdminTriageItem[];
  areas: Record<AdminTriageArea, AdminTriageAreaState>;
  /** 1:1 문의 칸 링크용 — 접수·답변중 목록의 전체 건수. 받기 전이면 undefined */
  inquiryTotals: { received: number | undefined; inProgress: number | undefined };
  /** 영역 하나라도 로딩 */
  isLoading: boolean;
  /** 받은 승인 대기 동아리에 시각 필드가 없다(옛 백엔드) — 칸은 '신청 시각 —'로 물러선다. */
  clubApprovalTimeUnknown: boolean;
  /** 영역 하나라도 실패 */
  isError: boolean;
};
