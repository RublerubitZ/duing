import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS as COLLEGE_CODES, type College } from '@duing/types';

// 단과대 목록의 source of truth 는 @duing/types 하나다 — 여기서는 select/칩이 바로 쓰는
// { code, label } 모양으로만 옮긴다. 목록을 추가·수정할 일이 생기면 types 쪽만 고치면 된다.
export const COLLEGE_OPTIONS: { code: College; label: string }[] = COLLEGE_CODES.map((code) => ({
  code,
  label: COLLEGE_DISPLAY_NAME[code],
}));

export function collegeDisplayName(code: College): string {
  return COLLEGE_DISPLAY_NAME[code] ?? code;
}
