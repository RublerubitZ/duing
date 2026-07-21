import {
  COLLEGE_DISPLAY_NAME,
  GRADE_DISPLAY_NAME,
  isCollege,
  type AdminUserSearchResult,
} from '@duing/types';

import { cn } from '@/app/_lib/cn';

/**
 * 회원 검색 결과 한 명의 식별 표기. 동아리장 검색 드롭다운과 회원 관리 테이블이 같은 형식을 쓰도록
 * 한 곳에 둔다 — 이름(강조) 위에 학번·학년·단과대·전공을 가운뎃점으로 잇는다.
 *
 * 값이 없는 조각은 구분자까지 함께 뺀다. grade·college 는 배포 전환기(구 백엔드 응답)에 없을 수 있어
 * 알려진 코드일 때만 라벨링하고, major 는 자유 입력이라 빈 문자열이면 생략한다.
 */
export function memberMetaParts(user: AdminUserSearchResult): string[] {
  const gradeLabel = user.grade ? GRADE_DISPLAY_NAME[user.grade] : undefined;
  const collegeLabel = isCollege(user.college) ? COLLEGE_DISPLAY_NAME[user.college] : undefined;
  const major = user.major?.trim() || undefined;
  return [user.studentId, gradeLabel, collegeLabel, major].filter(
    (part): part is string => Boolean(part),
  );
}

export function MemberIdentity({
  user,
  className,
}: {
  user: AdminUserSearchResult;
  className?: string;
}) {
  const meta = memberMetaParts(user);
  return (
    <div className={cn('min-w-0 leading-tight', className)}>
      <div className="truncate text-[13.5px] font-semibold text-charcoal">{user.name}</div>
      {/* break-keep — 좁은 화면에서 어절 단위로만 접어 '컴퓨터/공학' 처럼 낱말이 잘리지 않게 한다. */}
      <div className="mt-0.5 break-keep text-[11.5px] text-charcoal-3">{meta.join(' · ')}</div>
    </div>
  );
}
