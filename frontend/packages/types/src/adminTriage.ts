import type { ReportReasonCode, ReportTargetType } from './admin';
import type { BookingStatus } from './facility';
import type { FederationInquiryStatus } from './federationInquiry';

/** 총동연 홈 처리 대기열의 영역. 동아리 승인은 신청 시각이 없어 대기열 밖에서 건수로만 다룬다. */
export type AdminTriageArea = 'REPORT' | 'INQUIRY' | 'FACILITY' | 'RECRUITMENT' | 'PROMOTION' | 'SUCCESSION';

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
  | { area: 'SUCCESSION'; id: number; waitingSince: string; clubName: string; requesterName: string };

/** 영역 하나의 목록 상태 — 상태별로 나뉜 하위 목록(문의·시설)과 끝 페이지를 묶은 결과. */
export type AdminTriageAreaState = {
  status: 'loading' | 'error' | 'ready';
  /** 받은 행 수(성공한 하위 목록 기준) */
  rowCount: number;
  /** 받은 행 중 가장 이른 대기 시작 시각. 행이 없으면 null */
  oldestWaitingSince: string | null;
};

export type AdminTriageQueue = {
  /** 오래 기다린 순 상위 10건(동아리 승인 제외) */
  items: AdminTriageItem[];
  areas: Record<AdminTriageArea, AdminTriageAreaState>;
  /** 1:1 문의 칸 링크용 — 접수·답변중 목록의 전체 건수. 받기 전이면 undefined */
  inquiryTotals: { received: number | undefined; inProgress: number | undefined };
  /** 영역 하나라도 로딩 */
  isLoading: boolean;
  /** 영역 하나라도 실패 */
  isError: boolean;
};
