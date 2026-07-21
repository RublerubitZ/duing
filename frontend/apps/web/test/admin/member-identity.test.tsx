import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminUserSearchResult } from '@duing/types';

import { MemberIdentity, memberMetaParts } from '@/app/admin/_components/MemberIdentity';

function makeUser(overrides: Partial<AdminUserSearchResult> = {}): AdminUserSearchResult {
  return {
    id: 1,
    studentId: '20231234',
    name: '홍길동',
    role: 'STUDENT',
    grade: 'JUNIOR',
    college: 'IT_ENGINEERING',
    major: '컴퓨터공학',
    ...overrides,
  };
}

describe('MemberIdentity', () => {
  it('이름과 학번·학년·단과대·전공 메타를 함께 표시한다', () => {
    render(<MemberIdentity user={makeUser()} />);

    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(
      screen.getByText('20231234 · 3학년 · IT·공과대학 · 컴퓨터공학'),
    ).toBeInTheDocument();
  });

  it('전공이 비어 있으면 그 조각과 구분자까지 함께 생략한다', () => {
    expect(memberMetaParts(makeUser({ major: '' }))).toEqual([
      '20231234',
      '3학년',
      'IT·공과대학',
    ]);
    // 끝에 매달린 가운뎃점이 남지 않는다.
    expect(memberMetaParts(makeUser({ major: '   ' })).join(' · ')).toBe(
      '20231234 · 3학년 · IT·공과대학',
    );
  });

  it('알 수 없는 단과대 코드는 라벨 대신 생략한다(배포 전환기 안전)', () => {
    // 타입 체계 밖의 미지 코드를 주입해야 하므로 이중 단언(레포의 전환기 테스트 관례).
    const unknownCollege = makeUser({
      college: 'UNKNOWN_CODE' as unknown as AdminUserSearchResult['college'],
    });
    expect(memberMetaParts(unknownCollege)).toEqual(['20231234', '3학년', '컴퓨터공학']);
  });

  it('식별 필드가 아예 없는 구 백엔드 응답에서는 학번만 표시한다(전환기 fail-open)', () => {
    // #715 이전 응답에는 grade·college·major 필드 자체가 없다(런타임 undefined).
    const legacyUser = {
      id: 1,
      studentId: '20231234',
      name: '홍길동',
      role: 'STUDENT',
    } as unknown as AdminUserSearchResult;
    expect(memberMetaParts(legacyUser)).toEqual(['20231234']);
  });
});
