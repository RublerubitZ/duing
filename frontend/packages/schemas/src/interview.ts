import { z } from 'zod';

// 운영진이 면접 설정을 최초 생성할 때 사용하는 스키마.
// availabilityDeadline 은 백엔드 LocalDateTime(timezone-naive) 으로 직렬화되므로
// datetime-local input 의 로컬 문자열(`YYYY-MM-DDTHH:mm` 또는 `:ss`/`Z`/오프셋 포함) 모두 허용한다.
// Jackson 의 LocalDateTime deserializer 가 `Z` 를 무시하기 때문에 UTC 변환을 거치면 KST 기준 9시간이
// 어긋난다. 따라서 클라이언트는 사용자가 입력한 로컬 문자열을 그대로 백엔드에 전달한다.
// location 은 선택값 — 미입력도 허용. 최대 200자.
export const createInterviewConfigSchema = z.object({
  availabilityDeadline: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
      'YYYY-MM-DDTHH:mm 형식이어야 합니다',
    )
    .refine((value) => {
      const parsed = new Date(value);
      return !Number.isNaN(parsed.getTime()) && parsed > new Date();
    }, '면접 가능시간 마감은 미래여야 합니다'),
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
