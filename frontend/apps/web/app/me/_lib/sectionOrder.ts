export type SectionId = 'apply' | 'joined' | 'saved' | 'inquiries' | 'archived';

export const SECTION_LABEL: Record<SectionId, string> = {
  apply: '지원 현황',
  joined: '가입한 동아리',
  saved: '찜한 동아리',
  inquiries: '내 문의',
  archived: '지난 지원',
};

/** 모바일 탭 1줄용 짧은 라벨 — 375px 이상에서 5개가 줄바꿈·스크롤 없이 들어가도록(320px 은 가로 스크롤). PC 는 SECTION_LABEL 그대로. */
export const SECTION_SHORT_LABEL: Record<SectionId, string> = {
  apply: '지원',
  joined: '가입',
  saved: '찜',
  inquiries: '문의',
  archived: '지난 지원',
};

/** 진행 중 지원이 없는 회원에게는 "진행 중인 지원이 없어요" 대신 내 동아리를 먼저 보여준다. */
export function resolveSectionOrder(inProgressCount: number): SectionId[] {
  return inProgressCount === 0
    ? ['joined', 'apply', 'saved', 'inquiries', 'archived']
    : ['apply', 'joined', 'saved', 'inquiries', 'archived'];
}
