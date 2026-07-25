import { describe, expect, it } from 'vitest';
import { clubMemberRoleLabel } from '../../app/_lib/clubMemberRoleLabel';

describe('clubMemberRoleLabel', () => {
  it.each([
    ['LEADER', '회장'],
    ['OFFICER', '임원'],
    ['MEMBER', '부원'],
  ] as const)('%s → %s', (role, expected) => {
    expect(clubMemberRoleLabel(role)).toBe(expected);
  });
});
