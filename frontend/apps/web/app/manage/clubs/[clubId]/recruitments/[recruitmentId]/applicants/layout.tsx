import type { ReactNode } from 'react';

import { ApplicantSearchProvider } from './_lib/applicantSearch';

/**
 * 목록과 상세가 검색어를 공유하도록 세그먼트 전체를 감싼다.
 * 검색어를 주소에서 뺀 이유와 이 자리인 이유는 applicantSearch 주석에 있다.
 */
export default function ApplicantsLayout({ children }: { children: ReactNode }) {
  return <ApplicantSearchProvider>{children}</ApplicantSearchProvider>;
}
