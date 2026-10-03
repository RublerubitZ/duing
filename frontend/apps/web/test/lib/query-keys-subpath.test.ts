import { describe, expect, it } from 'vitest';

import { clubQueryKeys as barrelClubKeys, noticeQueryKeys as barrelNoticeKeys } from '@duing/hooks';
import { clubQueryKeys, noticeQueryKeys } from '@duing/hooks/query-keys';

// 서버 컴포넌트는 배럴(@duing/hooks — 최상단 createContext)을 import 할 수 없어 키만 서브패스로 받는다.
// 클라이언트 훅과 같은 키를 써야 시드가 그대로 캐시에 잡힌다.
describe('@duing/hooks/query-keys', () => {
  it('배럴과 같은 키 팩토리를 내보낸다', () => {
    expect(clubQueryKeys.detail(4)).toEqual(barrelClubKeys.detail(4));
    expect(clubQueryKeys.detail(4)).toEqual(['clubs', 4]);
    expect(noticeQueryKeys.detail(7)).toEqual(barrelNoticeKeys.detail(7));
  });
});
