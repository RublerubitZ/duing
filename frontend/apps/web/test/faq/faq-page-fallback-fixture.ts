import type { FederationFaqCategory, FederationFaqItem, PageResponse } from '@duing/types';

// FAQ 서버 기본 목록(fallback) 서버 렌더·교체 밀림 가드가 함께 쓰는 운영형 첫 페이지 — 고정 질문 1개, 카테고리 캡션이 있는
// 질문, 여러 줄 답변을 함께 지난다. 카테고리에는 운영처럼 질문이 하나도 없는 것(지원사업·예산·기타)을 둔다 — 행이 카테고리
// 이름을 캡션으로 그리므로, 칩이 그려졌는지는 이 빈 카테고리 이름으로 가려낼 수 있다.
export const faqCategories: FederationFaqCategory[] = [
  { id: 1, name: '두잉 이용', sortOrder: 1 },
  { id: 2, name: '동아리 등록', sortOrder: 2 },
  { id: 3, name: '모집·행사', sortOrder: 3 },
  { id: 4, name: '지원사업·예산', sortOrder: 4 },
  { id: 5, name: '기타', sortOrder: 5 },
];

export const faqListPage: PageResponse<FederationFaqItem> = {
  content: [
    {
      id: 11,
      categoryId: 1,
      categoryName: '두잉 이용',
      question: '두잉은 어떤 서비스인가요?',
      answer: '대구대학교 동아리를 둘러보고 지원부터 운영까지 한곳에서 하는 통합 플랫폼이에요.',
      pinned: true,
    },
    {
      id: 12,
      categoryId: 2,
      categoryName: '동아리 등록',
      question: '우리 동아리도 두잉에 등록할 수 있나요?',
      answer: '총동아리연합회 심사를 거쳐 등록돼요.\n1:1 문의로 신청해 주세요.',
      pinned: false,
    },
    {
      id: 13,
      categoryId: 3,
      categoryName: '모집·행사',
      question: '모집이 마감된 뒤에도 지원할 수 있나요?',
      answer: '마감된 모집에는 지원할 수 없어요. 다음 모집 소식을 기다려 주세요.',
      pinned: false,
    },
  ],
  page: 0,
  size: 20,
  totalElements: 3,
  totalPages: 1,
  hasNext: false,
};
