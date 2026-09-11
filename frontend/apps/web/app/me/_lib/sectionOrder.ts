export type SectionId = 'apply' | 'joined' | 'saved' | 'inquiries' | 'archived';

export const SECTION_LABEL: Record<SectionId, string> = {
  apply: '지원 현황',
  joined: '가입한 동아리',
  saved: '찜한 동아리',
  inquiries: '내 문의',
  archived: '지난 지원',
};

/** 진행 중 지원이 없는 회원에게는 "진행 중인 지원이 없어요" 대신 내 동아리를 먼저 보여준다. */
export function resolveSectionOrder(inProgressCount: number): SectionId[] {
  return inProgressCount === 0
    ? ['joined', 'apply', 'saved', 'inquiries', 'archived']
    : ['apply', 'joined', 'saved', 'inquiries', 'archived'];
}
