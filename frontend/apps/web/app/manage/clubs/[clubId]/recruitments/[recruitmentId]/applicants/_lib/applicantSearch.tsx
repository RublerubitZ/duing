'use client';

import { createContext, useContext, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

/**
 * 지원자 검색어 보관소 — 주소가 아니라 화면 상태다.
 *
 * 검색창 안내가 "이름·학번·학과로 검색" 이라 입력값이 곧 학생 개인정보다. 주소에 실리는 순간
 * 브라우저 방문 기록·referrer·배포 플랫폼 액세스 로그·분석 도구의 현재 주소로 함께 새어나간다.
 * 총동연 회원 관리가 같은 이유로 검색어만 주소에서 뺐고, 여기도 같은 판단이다. 상태·단과대·기간
 * 같은 비식별 조건은 공유·뒤로가기 목적이 있으니 주소에 그대로 남긴다.
 *
 * 목록과 상세가 다른 라우트라 페이지 컴포넌트 상태로 두면 상세의 이전/다음·목록 복귀가 검색 맥락을
 * 잃는다. 그래서 두 라우트를 함께 덮는 applicants 세그먼트 layout 에 상태를 둔다 — 세그먼트 안을
 * 오가는 동안만 살아 있고, 화면을 벗어나거나 새로고침하면 사라져 개인정보가 저장소에 남지 않는다.
 */
type ApplicantSearchState = [string, Dispatch<SetStateAction<string>>];

const ApplicantSearchContext = createContext<ApplicantSearchState | null>(null);

export function ApplicantSearchProvider({ children }: { children: ReactNode }) {
  const searchState = useState('');
  return (
    <ApplicantSearchContext.Provider value={searchState}>
      {children}
    </ApplicantSearchContext.Provider>
  );
}

/**
 * `[검색어, 설정 함수]` — useState 와 같은 모양.
 *
 * Provider 밖에서는 지역 상태로 떨어진다: 검색 자체는 그대로 되고 라우트를 넘어가며 이어지지 않을
 * 뿐이라, 상세 URL 로 새로고침해 들어왔을 때와 같은 상태다. 던지는 대신 이렇게 두는 이유는 검색어가
 * 없어도 목록·이전/다음이 모두 동작해야 하기 때문이다.
 */
export function useApplicantSearch(): ApplicantSearchState {
  const shared = useContext(ApplicantSearchContext);
  const local = useState('');
  return shared ?? local;
}
