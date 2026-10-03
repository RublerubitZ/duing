import type { NoticeSource } from '@duing/types';

/** 소식 목록 한 페이지 크기 — 화면(NoticePage)과 서버 시드(page.tsx)가 같은 키를 만들도록 한곳에 둔다. */
export const NOTICE_LIST_PAGE_SIZE = 20;

/** 목록 화면의 첫 진입 조건(학교 공지·전체 카테고리·검색 없음·첫 페이지) — 서버가 이 키로 시드한다. */
export const DEFAULT_NOTICE_LIST_PARAMS: { source: NoticeSource; page: number; size: number } = {
  source: 'SCHOOL',
  page: 0,
  size: NOTICE_LIST_PAGE_SIZE,
};
