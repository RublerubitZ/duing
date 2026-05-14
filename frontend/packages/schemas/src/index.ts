// 백엔드 Bean Validation 규칙(@NotBlank/@Email/@Pattern/@Size 등)을 미러링한 Zod 스키마.
// 한국어 메시지는 백엔드와 동일하게 유지한다.

import { z } from 'zod';

export const signupSchema = z.object({
  studentId: z
    .string()
    .min(1, '학번은 필수 입력값입니다.')
    .regex(/^\d{7,10}$/, '학번은 7~10자리 숫자여야 합니다.'),
  name: z
    .string()
    .min(1, '이름은 필수 입력값입니다.')
    .max(50, '이름은 50자 이하여야 합니다.'),
  email: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('올바른 이메일 형식이 아닙니다.')
    .max(100, '이메일은 100자 이하여야 합니다.'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상 72자 이하여야 합니다.')
    .max(72, '비밀번호는 8자 이상 72자 이하여야 합니다.'),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('올바른 이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호는 필수 입력값입니다.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createRecruitmentSchema = z
  .object({
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(200, '제목은 200자 이하여야 합니다.'),
    content: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
    capacity: z.number().int().min(1, '모집 정원은 1명 이상이어야 합니다.'),
    questions: z.array(z.string()).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: '모집 종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  });

export type CreateRecruitmentInput = z.infer<typeof createRecruitmentSchema>;
