import type { College, Grade } from './user';

/**
 * 학기별 정보 확인 팝업 상태(GET /users/me/profile-check).
 * 띄울 게 없으면 pending=false 이고 서버는 나머지 필드를 null 로 보낸다(이 쪽 형태는 pending 만 본다).
 */
export type ProfileCheckStatus =
  | { pending: false }
  | {
      pending: true;
      semesterYear: number;
      semesterTerm: 1 | 2;
      title: string;
      message: string;
      grade: Grade;
      college: College | null;
      major: string | null;
      // 1학기 1~3학년이면 다음 학년, 아니면 null("현재 정보가 맞아요").
      suggestedGrade: Grade | null;
    };

export type PendingProfileCheckStatus = Extract<ProfileCheckStatus, { pending: true }>;

export type ConfirmProfileCheckPayload = {
  semesterYear: number;
  semesterTerm: number;
  // null = 현재 정보 그대로 확인. 학년을 보내면 서버 제안값과 같아야 한다(절대값 — 재전송에도 두 번 오르지 않는다).
  grade: Grade | null;
};
