// 백엔드 Bean Validation 규칙(@NotBlank/@Email/@Pattern/@Size/@AssertTrue 등)을 미러링한 Zod 스키마.
// 한국어 메시지는 백엔드와 동일하게 유지한다.

import { z } from 'zod';
import { BANKS } from '@duing/types';
import type { GenerateBillsPayload } from '@duing/types';
import { passwordSchema } from './password';

export { passwordSchema } from './password';

const GRADE_VALUES = ['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'ON_LEAVE', 'GRADUATED'] as const;
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
    .regex(/^\d{8}$/, '학번은 8자리 숫자여야 합니다.'),
  name: z
    .string()
    .min(1, '이름은 필수 입력값입니다.')
    .max(50, '이름은 50자 이하여야 합니다.'),
  password: passwordSchema,
  grade: z.enum(GRADE_VALUES, { errorMap: () => ({ message: '학년을 선택해주세요.' }) }),
  college: z.enum(COLLEGE_VALUES, { errorMap: () => ({ message: '단과대학을 선택해주세요.' }) }),
  major: z
    .string()
    .min(1, '전공 학과는 필수 입력값입니다.')
    .max(50, '전공 학과는 50자 이하여야 합니다.'),
  verificationToken: z
    .string()
    .min(1, '휴대폰 인증을 완료해주세요.')
    .max(36, '휴대폰 인증 정보가 올바르지 않습니다.'),
  termsOfServiceAgreed: z.literal(true, {
    errorMap: () => ({ message: '이용약관에 동의해야 합니다.' }),
  }),
  privacyPolicyAgreed: z.literal(true, {
    errorMap: () => ({ message: '개인정보 수집·이용에 동의해야 합니다.' }),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  studentId: z
    .string()
    .min(1, '학번은 필수 입력값입니다.')
    .regex(/^\d{8}$/, '학번은 8자리 숫자여야 합니다.'),
  password: z.string().min(1, '비밀번호는 필수 입력값입니다.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// 지원서 질문 — 백엔드 QuestionItemRequest/ChoiceRequest 미러.
// id 는 수정 시 왕복(신규 항목은 null)하며 서버가 발급·보존한다.
const questionChoiceItemSchema = z.object({
  id: z.string().nullable().optional(),
  label: z
    .string()
    .trim()
    .min(1, '선택지를 입력해주세요.')
    .max(200, '선택지는 200자 이하여야 합니다.'),
});

export const questionItemSchema = z
  .object({
    id: z.string().nullable().optional(),
    text: z
      .string()
      .trim()
      .min(1, '질문 내용을 입력해주세요.')
      .max(500, '질문은 500자 이하여야 합니다.'),
    type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE']),
    required: z.boolean(),
    choices: z
      .array(questionChoiceItemSchema)
      .max(20, '선택지는 질문당 최대 20개까지 등록할 수 있습니다.'),
  })
  .superRefine((item, ctx) => {
    if (item.type === 'TEXT') {
      if (item.choices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '주관식 질문에는 선택지를 둘 수 없습니다.',
          path: ['choices'],
        });
      }
      return;
    }
    if (item.choices.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '선택형 질문은 선택지를 2개 이상 등록해야 합니다.',
        path: ['choices'],
      });
    }
    const labels = item.choices.map((choice) => choice.label.trim());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '같은 질문 안에서 선택지 내용이 중복될 수 없습니다.',
        path: ['choices'],
      });
    }
  });

export type QuestionItemInput = z.infer<typeof questionItemSchema>;

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
    questionItems: z
      .array(questionItemSchema)
      .max(50, '질문은 최대 50개까지 등록할 수 있습니다.')
      .optional(),
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
      (Array.isArray(data.questionItems) && data.questionItems.length > 0),
    {
      message: '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.',
      path: ['questionItems'],
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
    // 수정에서는 applicationMode 를 받지 않는다. 자체 폼일 때만 호출부가 questionItems 를 채우므로
    // "제공되었다면 최소 1개" 로 백엔드의 400(자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.)을 선제 차단한다.
    questionItems: z
      .array(questionItemSchema)
      .min(1, '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.')
      .max(50, '질문은 최대 50개까지 등록할 수 있습니다.')
      .optional(),
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
  // 이메일 전용에서 자유 입력(전화/카톡 오픈채팅/인스타 DM 등)으로 정책 변경 — 형식 검증 제거, 길이 제한만 유지.
  contactEmail: z
    .string()
    .max(200, '연락처는 200자 이하여야 합니다.')
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
  // 새 입력 UI 는 20자로 제한 — 기존 60자 제한 시절 저장된 값이 깨지지 않게 검증 백스톱은 60 유지.
  tagline: z.string().max(60, '한줄 소개는 60자 이하여야 합니다.').nullable().optional(),
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

// 리치 에디터(Tiptap)는 빈 문서를 '<p></p>' 로 직렬화하므로 min(1) 만으로는 빈 본문을 막지 못한다.
// DOM 없이(공유 스키마는 DOM API 금지) 태그를 제거한 가시 텍스트 또는 이미지 유무로 빈 본문을 판정한다.
const hasVisibleNoticeBody = (html: string): boolean =>
  /<img\b/i.test(html) ||
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, '').length > 0;

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
    .max(20000, '본문은 20000자 이하여야 합니다.')
    .refine(hasVisibleNoticeBody, '본문은 필수 입력값입니다.'),
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
    // linkUrl 빈 문자열은 의도된 "미입력" 신호 — regex 우회.
    // `.optional().or(z.literal(''))` 만으로는 zod 의 union 평가 타이밍 때문에
    // 빈 문자열 입력 시 regex 에러가 먼저 노출되는 케이스가 있어 conditional refine 으로 명시.
    linkUrl: z
      .string()
      .max(500, '링크는 500자 이하여야 합니다.')
      .refine(
        (value) => value === '' || LINK_URL_PATTERN.test(value),
        '링크는 http:// 또는 https:// 로 시작해야 합니다.',
      )
      .optional()
      .or(z.literal('')),
    coverImageUrl: z
      .string()
      .max(500, '이미지 URL은 500자 이하여야 합니다.')
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
    title: z
      .string()
      .min(1, '제목은 필수 입력값입니다.')
      .max(120, '제목은 120자 이하여야 합니다.')
      .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.')
      .optional(),
    description: z.string().max(2000).optional().or(z.literal('')),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    location: z.string().max(200).optional().or(z.literal('')),
    // linkUrl 빈 문자열은 의도된 "미입력" 신호 — regex 우회 (createGlobalEventSchema 와 동일 패턴).
    linkUrl: z
      .string()
      .max(500)
      .refine(
        (value) => value === '' || LINK_URL_PATTERN.test(value),
        '링크는 http:// 또는 https:// 로 시작해야 합니다.',
      )
      .optional()
      .or(z.literal('')),
    coverImageUrl: z
      .string()
      .max(500, '이미지 URL은 500자 이하여야 합니다.')
      .optional()
      .or(z.literal('')),
    clearCoverImage: z.boolean().optional(),
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

export {
  createInterviewConfigSchema,
  updateInterviewConfigSchema,
  slotPatternSchema,
  updateAvailabilitySchema,
} from './interview';
export type {
  CreateInterviewConfigInput,
  UpdateInterviewConfigInput,
  SlotPatternInput,
  UpdateAvailabilityInput,
} from './interview';

// === 회비(fee) ===
// 빈 number 입력("")을 undefined 로 정규화한다 — z.coerce.number()는 ""→0 으로 강제하므로(자동발행 off 시 오탐) 전처리가 필요.
const optionalDay = (label: string) =>
  z.preprocess(
    (raw) => (raw === '' || raw === undefined || raw === null ? undefined : raw),
    z.coerce
      .number({ invalid_type_error: `${label}은 숫자여야 합니다.` })
      .int(`${label}은 정수여야 합니다.`)
      .min(1, `${label}은 1~28 사이여야 합니다.`)
      .max(28, `${label}은 1~28 사이여야 합니다.`)
      .optional(),
  );

// 정책 생성: CreateFeePolicyRequest(@NotBlank name/@Size(100), @NotNull @PositiveOrZero amount, @NotNull billingType,
//   autoIssue, issueDay, dueDay) 미러. autoIssue=true 면 MONTHLY 강제·발행일/마감일 필수·마감일≥발행일.
export const createFeePolicySchema = z
  .object({
    name: z.string().min(1, '정책 이름은 필수입니다.').max(100, '정책 이름은 100자 이하여야 합니다.'),
    amount: z.coerce
      .number({ invalid_type_error: '금액은 숫자여야 합니다.' })
      .int('금액은 정수여야 합니다.')
      .min(0, '금액은 0 이상이어야 합니다.'),
    billingType: z.enum(['MONTHLY', 'SEMESTER', 'YEARLY', 'ONE_TIME'], {
      errorMap: () => ({ message: '회비 유형을 선택해주세요.' }),
    }),
    targetType: z.enum(['ALL_MEMBERS', 'SELECTED_MEMBERS'], {
      errorMap: () => ({ message: '청구 대상을 선택해주세요.' }),
    }),
    autoIssue: z.boolean().default(false),
    issueDay: optionalDay('발행일'),
    dueDay: optionalDay('마감일'),
  })
  .superRefine((value, ctx) => {
    if (!value.autoIssue) {
      return;
    }
    if (value.targetType !== 'ALL_MEMBERS') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoIssue'],
        message: '자동 발행은 전체 회원 정책에서만 설정할 수 있습니다.',
      });
      return;
    }
    if (value.billingType !== 'MONTHLY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoIssue'],
        message: '자동 발행은 매월(MONTHLY) 정책에서만 설정할 수 있습니다.',
      });
      return;
    }
    if (value.issueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issueDay'], message: '발행일을 입력해 주세요.' });
    }
    if (value.dueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDay'], message: '마감일을 입력해 주세요.' });
    }
    if (value.issueDay !== undefined && value.dueDay !== undefined && value.dueDay < value.issueDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDay'],
        message: '마감일은 발행일과 같거나 이후여야 합니다.',
      });
    }
  });

export type CreateFeePolicyInput = z.infer<typeof createFeePolicySchema>;

// 납부 기록: RecordPaymentRequest(amount @Positive, method CASH/TRANSFER/OTHER, paidAt @NotNull, memo @Size(200)) 미러.
// AUTO_MATCHED 는 수동 기록 불가(시스템 전용) — enum 에 포함하지 않는다.
export const recordPaymentSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: '납부 금액을 입력해 주세요.' })
    .int('납부 금액은 정수여야 합니다.')
    .positive('납부 금액은 1원 이상이어야 합니다.'),
  method: z.enum(['CASH', 'TRANSFER', 'OTHER'], {
    errorMap: () => ({ message: '납부 수단을 선택해 주세요.' }),
  }),
  paidAt: z.string().min(1, '납부일은 필수입니다.'),
  memo: z.string().max(200, '메모는 200자 이하여야 합니다.').optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// 청구 발행 폼 검증은 선택 정책의 billingType 으로 분기한다(discriminatedUnion).
// 와이어 페이로드는 flat(GenerateBillsPayload, billingType 미포함)이며 toGenerateBillsPayload 가 변환한다.
const monthlyBillsSchema = z.object({
  billingType: z.literal('MONTHLY'),
  billingPeriod: z.string().min(1, '회차(YYYY-MM)는 필수입니다.'),
  dueDate: z.string().optional(),
});
const yearlyBillsSchema = z.object({
  billingType: z.literal('YEARLY'),
  billingPeriod: z.string().min(1, '연도는 필수입니다.'),
  dueDate: z.string().optional(),
});
const semesterBillsSchema = z.object({
  billingType: z.literal('SEMESTER'),
  billingPeriod: z.string().min(1, '라벨은 필수입니다.'),
  billingStartDate: z.string().min(1, '시작일은 필수입니다.'),
  billingEndDate: z.string().min(1, '종료일은 필수입니다.'),
  dueDate: z.string().min(1, '마감일은 필수입니다.'),
});
const oneTimeBillsSchema = z.object({
  billingType: z.literal('ONE_TIME'),
  billingPeriod: z.string().min(1, '라벨은 필수입니다.'),
  billingStartDate: z.string().min(1, '행사일은 필수입니다.'),
  dueDate: z.string().min(1, '마감일은 필수입니다.'),
});

export const generateBillsSchema = z.discriminatedUnion('billingType', [
  monthlyBillsSchema,
  yearlyBillsSchema,
  semesterBillsSchema,
  oneTimeBillsSchema,
]);

export type GenerateBillsInput = z.infer<typeof generateBillsSchema>;

// 제출 시 billingType discriminator 를 떼어 flat 와이어 페이로드로 변환한다(백엔드 단일 DTO 와 정합).
// 빈 문자열 optional(예: MONTHLY/YEARLY 의 미입력 dueDate)은 와이어에서 제외한다 —
// 백엔드 GenerateBillsRequest 의 LocalDate 필드는 "" 를 역직렬화하지 못해 400 이 나기 때문이다.
export const toGenerateBillsPayload = (input: GenerateBillsInput): GenerateBillsPayload => {
  const payload: GenerateBillsPayload = { billingPeriod: input.billingPeriod };
  const billingStartDate = 'billingStartDate' in input ? input.billingStartDate : undefined;
  const billingEndDate = 'billingEndDate' in input ? input.billingEndDate : undefined;
  const dueDate = 'dueDate' in input ? input.dueDate : undefined;
  if (billingStartDate) {
    payload.billingStartDate = billingStartDate;
  }
  if (billingEndDate) {
    payload.billingEndDate = billingEndDate;
  }
  if (dueDate) {
    payload.dueDate = dueDate;
  }
  return payload;
};

// === 회비 계좌(fee account) ===
// UpsertFeeAccountRequest 미러:
//   bank        @NotNull Bank(19개 코드) — @duing/types 의 BANKS 단일 출처에서 파생.
//   accountNumber @NotBlank @Size(max=30) @Pattern(^[0-9-]+$)
//   accountHolder @NotBlank @Size(max=50)
export const feeAccountSchema = z.object({
  bank: z.enum(BANKS, {
    errorMap: () => ({ message: '은행을 선택해주세요.' }),
  }),
  accountNumber: z
    .string()
    .min(1, '계좌번호는 필수입니다.')
    .max(30, '계좌번호는 30자 이하여야 합니다.')
    .regex(/^[0-9-]+$/, '계좌번호는 숫자와 하이픈(-)만 입력할 수 있습니다.'),
  accountHolder: z
    .string()
    .min(1, '예금주는 필수입니다.')
    .max(50, '예금주는 50자 이하여야 합니다.'),
});

export type FeeAccountInput = z.infer<typeof feeAccountSchema>;

// === BANK 매칭 동기화(bank transaction sync) ===
// SyncBankTransactionsRequest 미러:
//   accountPassword @NotBlank — 계좌 비밀번호
//   residentNumber  @NotBlank — 주민등록번호 앞 6자리
// 민감 인증정보 — 영속화/로깅 금지. 폼은 제출 후 즉시 리셋한다(호출부 FE-2 책임).
export const syncBankTransactionsSchema = z.object({
  accountPassword: z.string().min(1, '계좌 비밀번호는 필수입니다.'),
  residentNumber: z.string().regex(/^\d{6}$/, '주민등록번호 앞 6자리를 입력해 주세요.'),
});

export type SyncBankTransactionsInput = z.infer<typeof syncBankTransactionsSchema>;

// === 금전출납부(cashbook) ===
// 백엔드 chk_cashbook_category / validateCategory 와 동일한 코드 집합(OTHER 는 수입·지출 공용).
const CASHBOOK_INCOME_CODES = ['FEE', 'SPONSOR', 'SUBSIDY', 'OTHER'] as const;
const CASHBOOK_EXPENSE_CODES = ['MT', 'DINING', 'SNACK', 'SUPPLY', 'MARKETING', 'OTHER'] as const;

export const createCashbookEntrySchema = z
  .object({
    entryType: z.enum(['INCOME', 'EXPENSE'], { errorMap: () => ({ message: '수입/지출을 선택해 주세요.' }) }),
    categoryCode: z.enum(['FEE', 'SPONSOR', 'SUBSIDY', 'MT', 'DINING', 'SNACK', 'SUPPLY', 'MARKETING', 'OTHER'], {
      errorMap: () => ({ message: '카테고리를 선택해 주세요.' }),
    }),
    customCategory: z.string().max(40, '직접입력 카테고리는 40자 이하여야 합니다.').optional(),
    amount: z.coerce
      .number({ invalid_type_error: '금액은 숫자여야 합니다.' })
      .int('금액은 정수여야 합니다.')
      .positive('금액은 1원 이상이어야 합니다.'),
    description: z.string().min(1, '설명은 필수입니다.').max(100, '설명은 100자 이하여야 합니다.'),
    transactionDate: z.string().min(1, '거래일은 필수입니다.'),
    memo: z.string().max(200, '메모는 200자 이하여야 합니다.').optional(),
  })
  .superRefine((value, ctx) => {
    const allowed: readonly string[] =
      value.entryType === 'INCOME' ? CASHBOOK_INCOME_CODES : CASHBOOK_EXPENSE_CODES;
    if (!allowed.includes(value.categoryCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryCode'],
        message: '선택한 카테고리가 수입/지출 유형에 맞지 않습니다.',
      });
    }
    if (value.categoryCode !== 'OTHER' && value.customCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customCategory'],
        message: '직접입력은 카테고리가 기타일 때만 가능합니다.',
      });
    }
  });

export type CreateCashbookEntryInput = z.infer<typeof createCashbookEntrySchema>;
