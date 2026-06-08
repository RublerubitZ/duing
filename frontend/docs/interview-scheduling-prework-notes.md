# Interview Scheduling Frontend — 사전 확인 메모

조사 일자: 2026-06-09  
조사 대상 브랜치: `develop`

---

## 1. Develop Tip SHA

```
1f5d18b docs(interview): 면접 스케줄링 frontend 구현 계획서
```

---

## 2. 기존 라우트 sibling 폴더

### 운영진 (manage)

`manage/clubs/[clubId]/recruitments/[recruitmentId]/` 하위:

| 폴더 | 설명 |
|------|------|
| `applicants/` | 지원자 목록 (filter·search·내 점수) |
| `applicants/[applicationId]/` | 지원자 상세 + 평가 + 타임라인 |
| `applicants/[applicationId]/_components/` | 지원자 상세 전용 컴포넌트 |
| `applicants/_components/` | 지원자 목록 전용 컴포넌트 |
| `edit/` | 모집 공고 수정 |
| `stats/` | 통계 |
| `stats/_components/` | 통계 전용 컴포넌트 |

→ 새 면접 라우트 위치 예시: `applicants/[applicationId]/interview-slots/` (지원자 슬롯 선택) 또는 `interview/` (운영진 면접 관리)

### 지원자 — apply

`apply/[recruitmentId]/` 하위:

| 경로 | 내용 |
|------|------|
| `_hooks/useAutosaveDraft.ts` | 지원서 자동저장 훅 (유일한 훅 파일) |
| `page.tsx` | 지원서 작성 페이지 |

→ `_components/` 폴더 없음. 컴포넌트는 `apps/web/components/` 레벨에 분산되어 있거나 미구현.

### 지원자 — me

`me/applications/[applicationId]/` 하위:

| 경로 | 내용 |
|------|------|
| `page.tsx` | 지원 내역 상세 페이지 |

→ `_components/`, `_pages/` 없음. 단일 `page.tsx`만 존재.

---

## 3. useAutosaveDraft Draft Model

파일: `apps/web/app/apply/[recruitmentId]/_hooks/useAutosaveDraft.ts`

```ts
export function useAutosaveDraft(
  answers: DraftAnswer[],  // ← 단일 인자
  { recruitmentId, enabled }: Options,
)
```

- `mutate`에 전달되는 페이로드: `{ answers }`
- `DraftAnswer[]` 타입은 `@duing/types`에서 import
- **`selectedSlotIds` 미포함** — draft 모델은 `DraftAnswer[]`만 저장. 면접 슬롯 선택은 별도 API(`/interview-slots`) 로 처리해야 함.
- autosave 로직에 슬롯 관련 상태 없음 → Task 1 면접 슬롯 선택 hook은 useAutosaveDraft 재사용 불가, 독립 구현 필요.

---

## 4. `apps/web/components/` 도메인 폴더 패턴

현재 존재하는 폴더:

| 폴더 | 내용 예시 |
|------|-----------|
| `duing/` | `BrandMark.tsx`, `Icon.tsx`, `Sparkle.tsx` (디자인 시스템 공통) |
| `report/` | `ReportModal.tsx` |

→ 네이밍 패턴: **소문자 단어** (하이픈 없음)  
→ 새 도메인 폴더: `interview/` 로 추가. 두 라우트 이상에서 공유하는 면접 관련 컴포넌트(슬롯 선택 UI 등) 위치.

---

## 5. RecruitmentDetailResponse 현재 필드 목록

파일: `backend/.../recruitment/controller/dto/response/RecruitmentDetailResponse.java`

| 필드명 | 타입 | 존재 여부 |
|--------|------|-----------|
| `id` | `Long` | ✅ |
| `clubId` | `Long` | ✅ |
| `clubName` | `String` | ✅ |
| `title` | `String` | ✅ |
| `content` | `String` | ✅ |
| `startDate` | `LocalDate` | ✅ |
| `endDate` | `LocalDate` | ✅ |
| `capacity` | `int` | ✅ |
| `status` | `RecruitmentStatus` | ✅ |
| `displayStatus` | `RecruitmentDisplayStatus` | ✅ |
| `effectivelyOpen` | `boolean` | ✅ |
| `questions` | `List<String>` | ✅ |
| `applicationMode` | `ApplicationMode` | ✅ |
| `externalFormUrl` | `String` | ✅ |
| `useInterview` | `boolean` | ✅ 있음 |
| `targetRole` | `TargetRole` | ✅ |
| `interviewStartDate` | `LocalDate` | ✅ 있음 |
| `interviewEndDate` | `LocalDate` | ✅ 있음 |
| `showApplicantCount` | `boolean` | ✅ |
| `applicantCount` | `Integer` | ✅ |
| `interviewAvailabilityDeadline` | — | ❌ 없음 |

**결론:**
- `useInterview`: 있음 → frontend `RecruitmentDetail` 타입에도 반영되어 있음 (`packages/types/src/recruitment.ts`)
- `interviewStartDate`, `interviewEndDate`: 있음 → 이미 types에도 반영
- `interviewAvailabilityDeadline`: **없음** → plan Task 1 commit 5 (백엔드에 필드 추가 + 마이그레이션)는 실제 작업이 필요

---

## 6. packages/{types,api,hooks,schemas} interview 관련 기존 파일

| 패키지 | 파일 | interview 관련 내용 |
|--------|------|----------------------|
| `types/src/recruitment.ts` | 기존 파일 | `useInterview`, `interviewStartDate`, `interviewEndDate` 포함 |
| `types/src/application.ts` | 기존 파일 | `ApplicationStatus.INTERVIEW_PENDING`, `interviewAt`, `interviewLocation`, `UpdateInterviewPayload` 포함 |
| `types/src/notification.ts` | 기존 파일 | interview 관련 알림 타입 (확인 필요) |
| `hooks/src/applications.ts` | 기존 파일 | `useUpdateInterviewMutation` 존재 |
| `api/src/client.ts` | 기존 파일 | `updateInterview` API 메서드 존재 (`PATCH leader/applications/:id/interview`) |
| `schemas/src/` | 기존 파일 | `password.ts`만 있음 — interview 관련 Zod schema 없음 |

→ interview 전용 파일(`interview.ts`)은 어느 패키지에도 없음. Task 1에서 신규 생성 필요.
→ 기존 UpdateInterviewPayload / useUpdateInterviewMutation 은 운영진 면접 일정 수동 업데이트용 (Spec B6) — Task 1~7 에서 재사용 가능.

---

## 7. Plan Task 1~7 영향 사항 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| `interviewAvailabilityDeadline` 백엔드 필드 | 없음 | Task 1에서 추가 필수 |
| frontend types에 interview 전용 타입 | 없음 | Task 1에서 신규 작성 |
| `interview/` component 폴더 | 없음 | Task 2~3에서 신규 생성 |
| useAutosaveDraft 재사용 | 불가 | 슬롯 선택 전용 hook 별도 구현 |
| 지원자 apply 라우트 `_components/` | 없음 | 면접 슬롯 선택 컴포넌트는 신규 추가 |
| me/applications `_components/` | 없음 | 면접 일정 확인 컴포넌트는 신규 추가 |
