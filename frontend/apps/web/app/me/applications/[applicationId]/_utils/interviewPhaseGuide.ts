// phase 전수 매핑 유틸 — stepper 와 ApplicantInterviewCard 가 공용으로 사용한다.
// 재파생 금지(스펙 §9.3): 입력은 서버 phase 뿐이며 마감 비교는 카드의 재응답 버튼 노출
// 한 곳에만 남긴다 (서버 409 가 최종 가드).
import type { ApplicantInterviewPhase } from '@duing/types';

export type InterviewPhaseGuide = {
  stepIndex: 1 | 2 | 3;
  title: string;
  description: string;
};

export function getInterviewPhaseGuide(
  phase: ApplicantInterviewPhase,
): InterviewPhaseGuide | null {
  switch (phase) {
    case 'DOCUMENT_REVIEW':
      return {
        stepIndex: 1,
        title: '서류 검토 중',
        description: '운영진이 서류를 검토하고 있습니다.',
      };
    case 'WAITING_ROUND':
      return {
        stepIndex: 2,
        title: '면접 회차 대기',
        description: '운영진이 면접 회차를 준비 중입니다.',
      };
    case 'WAITING_NEXT_ROUND':
      return {
        stepIndex: 2,
        title: '다음 회차 대기',
        description: '다음 면접 회차 안내를 기다리고 있습니다.',
      };
    case 'AVAILABILITY_REQUESTED':
      return {
        stepIndex: 2,
        title: '가능 시간 선택',
        description: '면접 가능 시간을 선택해 주세요.',
      };
    case 'AVAILABILITY_CLOSED':
      return {
        stepIndex: 2,
        title: '제출 마감',
        description:
          '가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.',
      };
    case 'RESPONDED':
      return {
        stepIndex: 2,
        title: '응답 완료',
        description: '가능 시간을 제출했습니다. 운영진이 일정을 배정 중입니다.',
      };
    case 'NO_SLOT_REPORTED':
      return {
        stepIndex: 2,
        title: '조율 요청됨',
        description: '가능한 시간이 없다고 응답했습니다. 운영진이 별도로 조율합니다.',
      };
    case 'SCHEDULING':
      return {
        stepIndex: 2,
        title: '배정 검토 중',
        description: '운영진이 면접 일정을 조율하고 있습니다.',
      };
    case 'SCHEDULED':
      return {
        stepIndex: 3,
        title: '일정 확정',
        description: '면접 일정이 확정되었습니다.',
      };
    case 'NOT_APPLICABLE':
      return null;
    default: {
      // ApplicantInterviewPhase union 확장 시 컴파일 타임에 누락을 잡는다.
      const _exhaustive: never = phase;
      void _exhaustive;
      return null;
    }
  }
}
