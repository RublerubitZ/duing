import { z } from 'zod';

// 운영진이 면접 설정을 최초 생성할 때 사용하는 스키마.
// availabilityDeadline 은 ISO 8601 datetime (백엔드 @Future + ISO 형식 기대).
// location 은 선택값 — 미입력도 허용. 최대 200자.
export const createInterviewConfigSchema = z.object({
  availabilityDeadline: z
    .string()
    .datetime({ message: 'ISO 8601 형식이어야 합니다' }),
  location: z
    .string()
    .trim()
    .max(200, '면접 장소는 200자 이내여야 합니다')
    .optional(),
});

// PATCH 용 — 모든 필드가 partial. 단, location 만 단독 전송도 허용.
export const updateInterviewConfigSchema = createInterviewConfigSchema.partial();

// 슬롯 패턴 (UI 가 한 번에 N 개 슬롯을 생성할 때 사용).
// startTime 부터 intervalMinutes 간격으로 count 개 슬롯, 각 슬롯의 capacity 동일.
export const slotPatternSchema = z.object({
  startTime: z.string().datetime(),
  intervalMinutes: z.number().int().positive().max(240),
  count: z.number().int().min(1).max(50),
  capacity: z.number().int().min(1).max(20),
});

// 지원자가 가능 슬롯을 등록/수정할 때 사용. 최소 1개 이상 선택해야 함.
export const updateAvailabilitySchema = z.object({
  slotIds: z
    .array(z.number().int())
    .min(1, '최소 1개 이상 선택해야 합니다'),
});

export type CreateInterviewConfigInput = z.infer<typeof createInterviewConfigSchema>;
export type UpdateInterviewConfigInput = z.infer<typeof updateInterviewConfigSchema>;
export type SlotPatternInput = z.infer<typeof slotPatternSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
