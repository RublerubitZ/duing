import type { Metadata } from 'next';

import { ClubDetailPage } from '../../../[clubId]/_pages/ClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

// 동아리 상세 인터셉트 — 목록·다른 상세·회원 화면에서 /clubs/<id> 로 소프트 이동하면 목록(children)을 숨긴 채 유지하고 상세를 이
// modal 슬롯에 그린다(스펙 P1). 데이터 없는 셸이다: 서버 조회·시드 없이 ClubDetailPage 가 클라이언트에서 받는다(목록 카드의 누름
// 선조회가 앞당긴다). 하드 로드·새로고침은 인터셉트가 없어 app/clubs/[clubId]/page.tsx 의 전체 페이지(ISR·메타·SEO)가 그대로다.
// generateMetadata 는 두지 않는다 — 인터셉트 뒤 head 는 재사용된 목록 것이 남아 그려지지 않는다(탭 제목은 useDocumentTitle).
// ⚠️ cookies()·headers()·searchParams 를 읽으면 동적 라우트(ƒ)가 돼 카드 프리페치마다 함수가 돈다 — 쓰지 말 것.
// 폴더는 (.)[clubId] 대신 루트 기준 (...)clubs 다 — dev 감시 이벤트마다 인터셉트 rewrite 가 쌓이는 Next 버그(vercel/next.js#91265)
// 때문이다. (.)[clubId] 는 결과 경로(/clubs/(.)<id>)가 원래 패턴에 다시 맞아 깨지고, (...)clubs 는 다시 맞지 않는다(운영 동작은 같다).

// 정적 메타데이터는 색인 차단 하나뿐이다 — 결과 경로(/clubs/(...)clubs/<id>)를 주소로 직접 열면 children 이 기본값이라 이 head 가
// 쓰여 셸이 200 으로 열린다(링크는 없다). 인터셉트 이동 중 head 는 숨은 목록 것이 먼저 골라져 그대로다.
export const metadata: Metadata = { robots: { index: false, follow: true } };

// 정적(●)을 지킨다 — 빌드 때 만드는 경로는 없고 경로마다 첫 요청 때 생성한다(app/clubs/[clubId]/page.tsx 와 같은 이유).
export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <ClubDetailPage clubId={Number(clubId)} />;
}
