import { describe, it, expect } from 'vitest';
import { signupSchema } from '../src/index';

const baseInput = {
  studentId: '20240001',
  name: '홍길동',
  password: 'Abcd1234!',
  grade: 'FRESHMAN',
  college: 'IT_ENGINEERING',
  major: '컴퓨터정보공학부',
  verificationToken: 'a'.repeat(36),
  termsOfServiceAgreed: true,
  privacyPolicyAgreed: true,
} as const;

describe('signupSchema — 학번', () => {
  it('정확히 8자리 숫자 학번을 통과시킨다', () => {
    expect(signupSchema.safeParse({ ...baseInput, studentId: '20240001' }).success).toBe(true);
  });

  it.each(['2024001', '202400012', '2024000a', ''])(
    '8자리 숫자가 아닌 학번(%s)은 거부한다',
    (studentId) => {
      expect(signupSchema.safeParse({ ...baseInput, studentId }).success).toBe(false);
    },
  );
});

describe('signupSchema — 학년', () => {
  it.each(['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'ON_LEAVE', 'GRADUATED'])(
    '유효한 학년(%s)을 통과시킨다',
    (grade) => {
      expect(signupSchema.safeParse({ ...baseInput, grade }).success).toBe(true);
    },
  );

  it('제거된 졸업유예(GRADUATE_DEFERRED)는 거부한다', () => {
    expect(signupSchema.safeParse({ ...baseInput, grade: 'GRADUATE_DEFERRED' }).success).toBe(false);
  });
});

describe('signupSchema — 휴대폰 인증 토큰', () => {
  it('유효한 verificationToken 을 통과시킨다', () => {
    expect(signupSchema.safeParse({ ...baseInput, verificationToken: 'a'.repeat(36) }).success).toBe(true);
  });

  it('휴대폰 인증을 완료하지 않아 verificationToken 이 빈 값이면 거부한다', () => {
    expect(signupSchema.safeParse({ ...baseInput, verificationToken: '' }).success).toBe(false);
  });

  it('36자를 초과하는 verificationToken 은 거부한다', () => {
    expect(signupSchema.safeParse({ ...baseInput, verificationToken: 'a'.repeat(37) }).success).toBe(false);
  });
});
