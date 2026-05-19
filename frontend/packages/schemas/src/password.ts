import { z } from 'zod';

// 백엔드 SignupRequest 의 password @Pattern 과 동일 규칙.
// 8~20자 + 영문/숫자/특수문자 중 2종 이상.
const PASSWORD_REGEX =
  /^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\-=\[\]{};':",./<>?])|(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':",./<>?])).+$/;

export const passwordSchema = z
  .string()
  .min(1, '비밀번호는 필수 입력값입니다.')
  .regex(
    PASSWORD_REGEX,
    '비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다.',
  );