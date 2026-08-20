import { describe, expect, it } from 'vitest';
import { memberPermissions } from '@/app/manage/clubs/[clubId]/members/_lib/memberPermissions';

// 역할 × 기수 사용 전수(4조합) + 폴백 역할 1건. 플래그를 통째로 비교해 매트릭스 자체를 잠근다 —
// 개별 플래그만 단언하면 새 플래그가 조용히 열려도 테스트가 통과한다.
describe('memberPermissions', () => {
  it('LEADER + 기수 사용: 승계 요청을 뺀 전부가 열린다', () => {
    expect(memberPermissions('LEADER', { useGeneration: true })).toEqual({
      canChangeRole: true,
      canKick: true,
      canTransferLeadership: true,
      canRequestSuccession: false,
      canEditGeneration: true,
      bulkSelectable: true,
    });
  });

  it('LEADER + 기수 미사용: 기수 수정만 닫히고 선택은 유지된다', () => {
    expect(memberPermissions('LEADER', { useGeneration: false })).toEqual({
      canChangeRole: true,
      canKick: true,
      canTransferLeadership: true,
      canRequestSuccession: false,
      canEditGeneration: false,
      bulkSelectable: true,
    });
  });

  it('OFFICER + 기수 사용: 기수 수정·승계 요청·선택만 열린다', () => {
    expect(memberPermissions('OFFICER', { useGeneration: true })).toEqual({
      canChangeRole: false,
      canKick: false,
      canTransferLeadership: false,
      canRequestSuccession: true,
      canEditGeneration: true,
      bulkSelectable: true,
    });
  });

  it('OFFICER + 기수 미사용: 승계 요청만 남고 선택도 닫힌다 — 실행 가능한 벌크 액션이 없다', () => {
    expect(memberPermissions('OFFICER', { useGeneration: false })).toEqual({
      canChangeRole: false,
      canKick: false,
      canTransferLeadership: false,
      canRequestSuccession: true,
      canEditGeneration: false,
      bulkSelectable: false,
    });
  });

  it('MEMBER 폴백: 기수를 쓰는 동아리라도 전부 닫힌다', () => {
    expect(memberPermissions('MEMBER', { useGeneration: true })).toEqual({
      canChangeRole: false,
      canKick: false,
      canTransferLeadership: false,
      canRequestSuccession: false,
      canEditGeneration: false,
      bulkSelectable: false,
    });
  });
});
