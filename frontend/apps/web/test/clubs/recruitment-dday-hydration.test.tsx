import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { todayKstDateString } from '@duing/hooks';
import type { StudentRecruitmentProjection } from '@duing/types';

import { ClubRecruitmentSummary } from '@/app/clubs/[clubId]/_components/ClubRecruitmentSummary';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 공개 동아리 상세는 7일 ISR 이라 HTML 이 하루 넘게 묵을 수 있다 — 렌더 날의 D-day 를 서버 HTML 에 박으면
// 보는 날의 하이드레이션과 글자가 달라진다(#418). 서버·첫 프레임은 "모집중", 하이드레이션 뒤에 D-day.
const openRecruitment: StudentRecruitmentProjection = {
  id: 1,
  title: '가을 부원 모집',
  startDate: todayKstDateString(new Date(Date.now() - 2 * 86_400_000)),
  endDate: todayKstDateString(new Date(Date.now() + 3 * 86_400_000)),
  displayStatus: 'OPEN',
  capacity: 20,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

describe('모집 D-day — 하이드레이션 뒤에만 계산', () => {
  it('서버 HTML 에는 D-day 가 없고, 하이드레이션 뒤에 나타나며 불일치가 없다', async () => {
    const element = <ClubRecruitmentSummary recruitment={openRecruitment} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);

    expect(container.textContent).toContain('모집중');
    expect(container.textContent).not.toContain('D-');

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toContain('모집중 · D-3');
  });
});
