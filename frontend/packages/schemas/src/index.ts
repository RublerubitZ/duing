// 백엔드 Bean Validation 규칙(@NotBlank/@Email/@Pattern/@Size/@AssertTrue 등)을 미러링한 Zod 스키마.
// 한국어 메시지는 백엔드와 동일하게 유지한다.

import { z } from 'zod';
import { passwordSchema } from './password';

export { passwordSchema } from './password';

const GRADE_VALUES = ['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'GRADUATE_DEFERRED'] as const;
const COLLEGE_VALUES = [
  'PUBLIC_LEADERS',
  'GLOBAL_BUSINESS',
  'SOCIAL_SCIENCE',
  'HEALTH_BIO',
  'IT_ENGINEERING',
  'DESIGN_ART',
  'EDUCATION',
  'REHABILITATION',
  'NURSING',
  'GLOCAL_LIFE',
  'INTERNATIONAL',
  'SPORTS_LEISURE',
  'CULTURE_CONTENTS',
  'FREE_MAJOR',
] as const;

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
    .max(100, '이메일은 100자 이하여야 합니다.')
    .regex(
      /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*daegu\.ac\.kr$/,
      '대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다.',
    ),
  password: passwordSchema,
  grade: z.enum(GRADE_VALUES, { errorMap: () => ({ message: '학년을 선택해주세요.' }) }),
  college: z.enum(COLLEGE_VALUES, { errorMap: () => ({ message: '단과대학을 선택해주세요.' }) }),
  major: z
    .string()
    .min(1, '전공 학과는 필수 입력값입니다.')
    .max(50, '전공 학과는 50자 이하여야 합니다.'),
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, '전화번호는 010-XXXX-XXXX 형식이어야 합니다.'),
  termsOfServiceAgreed: z.literal(true, {
    errorMap: () => ({ message: '이용약관에 동의해야 합니다.' }),
  }),
  privacyPolicyAgreed: z.literal(true, {
    errorMap: () => ({ message: '개인정보 수집·이용에 동의해야 합니다.' }),
  }),
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
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable(),
    capacity: z.number().int().min(1, '모집 정원은 1명 이상이어야 합니다.'),
    applicationMode: z.enum(['SELF', 'EXTERNAL']).default('SELF'),
    externalFormUrl: z.string().optional(),
    useInterview: z.boolean().default(false),
    targetRole: z.enum(['MEMBER', 'OFFICER']).default('MEMBER'),
    questions: z.array(z.string().min(1, '질문 내용을 입력해주세요.')).optional(),
    interviewStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable()
      .optional(),
    interviewEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable()
      .optional(),
    showApplicantCount: z.boolean().optional(),
  })
  .refine((data) => data.endDate === null || data.endDate >= data.startDate, {
    message: '모집 종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  })
  .refine(
    (data) =>
      data.applicationMode !== 'EXTERNAL' ||
      (typeof data.externalFormUrl === 'string' && data.externalFormUrl.trim().length > 0),
    {
      message: '외부 폼 URL은 필수 입력값입니다.',
      path: ['externalFormUrl'],
    },
  )
  .refine(
    (data) =>
      data.applicationMode !== 'SELF' ||
      (Array.isArray(data.questions) && data.questions.length > 0),
    {
      message: '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.',
      path: ['questions'],
    },
  )
  .refine(
    (data) => {
      if (!data.interviewStartDate || !data.interviewEndDate) return true;
      return data.interviewEndDate >= data.interviewStartDate;
    },
    {
      message: '면접 종료일은 시작일보다 빠를 수 없습니다.',
      path: ['interviewEndDate'],
    },
  );

export type CreateRecruitmentInput = z.infer<typeof createRecruitmentSchema>;

export const updateRecruitmentSchema = z
  .object({
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(200, '제목은 200자 이하여야 합니다.'),
    content: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.'),
    capacity: z.number().int().min(1, '모집 정원은 1명 이상이어야 합니다.'),
    useInterview: z.boolean(),
    questions: z.array(z.string().min(1, '질문 내용을 입력해주세요.')).optional(),
    interviewStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable()
      .optional(),
    interviewEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
      .nullable()
      .optional(),
    showApplicantCount: z.boolean().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: '모집 종료일은 시작일보다 빠를 수 없습니다.',
    path: ['endDate'],
  })
  .refine(
    (data) => {
      if (!data.interviewStartDate || !data.interviewEndDate) return true;
      return data.interviewEndDate >= data.interviewStartDate;
    },
    {
      message: '면접 종료일은 시작일보다 빠를 수 없습니다.',
      path: ['interviewEndDate'],
    },
  );

export type UpdateRecruitmentInput = z.infer<typeof updateRecruitmentSchema>;

export const updateClubSchema = z.object({
  name: z.string().min(1, '동아리 이름은 1~100자여야 합니다.')
    .max(100, '동아리 이름은 1~100자여야 합니다.'),
  category: z.enum(['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER']),
  division: z.string().max(50, '분류는 50자 이하여야 합니다.').nullable(),
  description: z.string().nullable(),
  logoUrl: z.string().max(500, '로고 URL은 500자 이하여야 합니다.').nullable(),
  coverUrl: z.string().max(500, '커버 URL은 500자 이하여야 합니다.').nullable(),
  tags: z.array(
    z.string().min(1, '각 태그는 1~20자여야 합니다.').max(20, '각 태그는 1~20자여야 합니다.'),
  ).max(20, '태그는 최대 20개까지 가능합니다.'),
  snsLinks: z.array(
    z.object({
      platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'X', 'YOUTUBE', 'KAKAO', 'WEB']),
      url: z.string().min(1, 'SNS URL은 1~500자여야 합니다.')
        .max(500, 'SNS URL은 1~500자여야 합니다.')
        .regex(/^https?:\/\/.+/, 'SNS URL은 http(s):// 로 시작해야 합니다.'),
    }),
  ).max(10, 'SNS 링크는 최대 10개까지 가능합니다.'),
  faqs: z.array(
    z.object({
      question: z.string().min(1, 'FAQ 질문은 1~200자여야 합니다.').max(200, 'FAQ 질문은 1~200자여야 합니다.'),
      answer: z.string().min(1, 'FAQ 답변은 1~2000자여야 합니다.').max(2000, 'FAQ 답변은 1~2000자여야 합니다.'),
      order: z.number().int().min(0, 'FAQ 순서는 0 이상이어야 합니다.'),
    }),
  ).max(20, 'FAQ는 최대 20개까지 가능합니다.'),
  foundedYear: z
    .number()
    .int()
    .min(1900, '창설년도는 1900 이상이어야 합니다.')
    .max(2100, '창설년도가 너무 큽니다.')
    .nullable()
    .optional(),
  cohortNumber: z
    .number()
    .int()
    .min(1, '기수는 1 이상이어야 합니다.')
    .nullable()
    .optional(),
  location: z
    .string()
    .max(200, '위치는 200자 이하여야 합니다.')
    .nullable()
    .optional(),
  contactEmail: z
    .string()
    .email('이메일 형식이 올바르지 않습니다.')
    .max(200, '이메일은 200자 이하여야 합니다.')
    .nullable()
    .or(z.literal(''))
    .optional(),
  activityFrequency: z
    .number()
    .int()
    .min(1, '활동 빈도는 1 이상이어야 합니다.')
    .nullable()
    .optional(),
  activeDays: z
    .array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']))
    .optional(),
  membershipFee: z
    .string()
    .max(100, '회비 표기는 100자 이하여야 합니다.')
    .nullable()
    .optional(),
  tagline: z.string().max(60, '한 줄 태그라인은 60자 이하여야 합니다.').nullable().optional(),
  highlights: z
    .array(z.string().min(1, '강조 항목은 비어 있을 수 없습니다.').max(100, '각 강조 항목은 100자 이하여야 합니다.'))
    .max(10, '강조 항목은 최대 10개까지 가능합니다.')
    .optional(),
  majorProjects: z.string().nullable().optional(),
});

export type UpdateClubInput = z.infer<typeof updateClubSchema>;

export const submitSuccessionRequestSchema = z.object({
  reason: z
    .string()
    .min(1, '사유는 필수 입력값입니다.')
    .max(1000, '사유는 1000자 이하여야 합니다.'),
});

export type SubmitSuccessionRequestInput = z.infer<typeof submitSuccessionRequestSchema>;

export const submitPromotionRequestSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수 입력값입니다.')
    .max(80, '제목은 80자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
  description: z
    .string()
    .min(1, '설명은 필수 입력값입니다.')
    .max(2000, '설명은 2000자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 설명은 입력할 수 없습니다.'),
  suggestedBannerImageUrl: z
    .string()
    .max(500, '배너 이미지 URL은 500자 이하여야 합니다.')
    .optional(),
  suggestedLinkUrl: z
    .string()
    .max(2000, '링크 URL은 2000자 이하여야 합니다.')
    .optional(),
});

export type SubmitPromotionRequestInput = z.infer<typeof submitPromotionRequestSchema>;

export const submitRecertificationRequestSchema = z.object({
  contactEmail: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('이메일 형식이 올바르지 않습니다.')
    .max(255, '이메일은 255자 이하여야 합니다.'),
  contactPhone: z
    .string()
    .min(1, '연락처는 필수 입력값입니다.')
    .max(40, '연락처는 40자 이하여야 합니다.'),
  operatingYear: z
    .number()
    .int()
    .min(2000, '운영 연도는 2000 이상이어야 합니다.')
    .max(2100, '운영 연도는 2100 이하여야 합니다.'),
  notes: z
    .string()
    .max(2000, '메모는 2000자 이하여야 합니다.')
    .optional()
    .or(z.literal('')),
});

export type SubmitRecertificationRequestInput = z.infer<typeof submitRecertificationRequestSchema>;

const REPORT_TARGET_TYPE_VALUES = ['CLUB', 'RECRUITMENT'] as const;
const REPORT_REASON_CODE_VALUES = [
  'SPAM',
  'FRAUD',
  'INAPPROPRIATE',
  'IMPERSONATION',
  'OTHER',
] as const;

export const submitReportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPE_VALUES, {
    errorMap: () => ({ message: '신고 대상 유형을 선택해주세요.' }),
  }),
  targetId: z.number().int().positive('신고 대상 ID가 유효하지 않습니다.'),
  reasonCode: z.enum(REPORT_REASON_CODE_VALUES, {
    errorMap: () => ({ message: '신고 사유를 선택해주세요.' }),
  }),
  detail: z
    .string()
    .max(1000, '상세 내용은 1000자 이하여야 합니다.')
    .optional(),
});

export type SubmitReportInput = z.infer<typeof submitReportSchema>;

export const createClubNoticeSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수 입력값입니다.')
    .max(120, '제목은 120자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
  summary: z.string().max(500, '요약은 500자 이하여야 합니다.').optional().or(z.literal('')),
  content: z
    .string()
    .min(1, '본문은 필수 입력값입니다.')
    .max(20000, '본문은 20000자 이하여야 합니다.'),
  coverImageUrl: z.string().max(500, '이미지 URL 은 500자 이하여야 합니다.').optional().or(z.literal('')),
  pinned: z.boolean().optional(),
  expiresAt: z.string().optional().or(z.literal('')),
});

export type CreateClubNoticeInput = z.infer<typeof createClubNoticeSchema>;

export const updateClubNoticeSchema = createClubNoticeSchema.partial();
export type UpdateClubNoticeInput = z.infer<typeof updateClubNoticeSchema>;

export const createClubEventSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수 입력값입니다.')
    .max(120, '제목은 120자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
  description: z.string().max(2000, '설명은 2000자 이하여야 합니다.').optional().or(z.literal('')),
  startAt: z.string().min(1, '시작 시각은 필수입니다.'),
  endAt: z.string().min(1, '종료 시각은 필수입니다.'),
  location: z.string().max(200, '장소는 200자 이하여야 합니다.').optional().or(z.literal('')),
}).refine((data) => new Date(data.endAt) >= new Date(data.startAt), {
  message: '종료 시각은 시작 시각 이후여야 합니다.',
  path: ['endAt'],
});

export type CreateClubEventInput = z.infer<typeof createClubEventSchema>;

export const updateClubEventSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  location: z.string().max(200).optional().or(z.literal('')),
});

export type UpdateClubEventInput = z.infer<typeof updateClubEventSchema>;

const LINK_URL_PATTERN = /^https?:\/\/.+/;

export const createGlobalEventSchema = z
  .object({
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(120, '제목은 120자 이하여야 합니다.')
      .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
    description: z.string().max(2000, '설명은 2000자 이하여야 합니다.').optional().or(z.literal('')),
    startAt: z.string().min(1, '시작 시각은 필수입니다.'),
    endAt: z.string().min(1, '종료 시각은 필수입니다.'),
    location: z.string().max(200, '장소는 200자 이하여야 합니다.').optional().or(z.literal('')),
    linkUrl: z
      .string()
      .max(500, '링크는 500자 이하여야 합니다.')
      .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
      .optional()
      .or(z.literal('')),
    category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER'], {
      errorMap: () => ({ message: '카테고리를 선택해주세요.' }),
    }),
  })
  .refine((data) => new Date(data.endAt) >= new Date(data.startAt), {
    message: '종료 시각은 시작 시각 이후여야 합니다.',
    path: ['endAt'],
  });

export type CreateGlobalEventInput = z.infer<typeof createGlobalEventSchema>;

export const updateGlobalEventSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().or(z.literal('')),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    location: z.string().max(200).optional().or(z.literal('')),
    linkUrl: z
      .string()
      .max(500)
      .regex(LINK_URL_PATTERN, '링크는 http:// 또는 https:// 로 시작해야 합니다.')
      .optional()
      .or(z.literal('')),
    category: z.enum(['FAIR', 'FESTIVAL', 'APPLICATION', 'CONTEST', 'UNION', 'OTHER']).optional(),
  })
  // partial update 에서도 startAt / endAt 둘 다 제공되면 순서 검증. 한쪽만 제공된 경우는 백엔드 entity 의 validatePeriod 가 최종 방어선.
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt) {
      if (new Date(data.endAt) < new Date(data.startAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '종료 시각은 시작 시각 이후여야 합니다.',
          path: ['endAt'],
        });
      }
    }
  });

export type UpdateGlobalEventInput = z.infer<typeof updateGlobalEventSchema>;
