# 시설 예약 대표 연락처 + 신청 확인 Dialog 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 신청 폼에 대표 연락처(저장·관리자 노출)를 추가하고, 예약 신청을 확인 Dialog 경유로 바꾼다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-17-facility-booking-contact-confirm-design.md`. BE(V85·API)와 FE(폼·Dialog·표기) 별도 브랜치/PR — BE 먼저 머지.

**Tech Stack:** Spring Boot 3.4/Java 21(BE), Next.js 15/React 19 + Radix Dialog(FE).

## Global Constraints

- 스펙 §1(검증 메시지·노출 범위·blankToNull)·§2(문구·Dialog 규칙) 자구 그대로. 승인 주체 "관리자", 예상 시간 암시 금지.
- Flyway 기존 파일 수정 금지(V85 신규만). 공개 API에 contactPhone 노출 금지(회귀 테스트).
- FE: `any`/`as` 금지, `type`만, 두잉 토큰만, 실제 POST 는 Dialog 확인에서만.
- 커밋: 한국어 Conventional Commits, Co-Authored-By/🤖 금지. push·PR 금지(컨트롤러 몫).
- gradle 은 backend/, pnpm 은 frontend/ 에서. 파이프로 exit code 가리지 말 것.

---

### Task 1: 백엔드 — contact_phone (V85·요청 검증·노출)

**Files:**
- Create: `backend/src/main/resources/db/migration/V85__facility_booking_contact_phone.sql`
- Modify: `CreateFacilityBookingRequest`(검증 필드)·command·`FacilityBooking` 엔티티·생성 경로
- Modify: 관리자 큐/상세 응답 DTO·동아리 관리 상세 응답 DTO (grep 으로 정확 위치 파악 — 공개 가용성 응답은 제외)
- Test: 형식 검증·저장·관리자 상세 노출·공개 API 비노출 회귀 (기존 acceptance/통합 테스트 파일 확장)

**Interfaces (Produces):** create 요청 `contactPhone`(필수, `^01[016789]-?\d{3,4}-?\d{4}$`), 관리자/manage 상세 응답 `contactPhone: string | null`(기존 행 빈 문자열 → null).

- [ ] **Step 1: 실패 테스트 (RED)** — 형식 무효 400(한국어 메시지)·유효 저장·관리자 상세 contactPhone 노출·기존 행 null·가용성 응답 비노출.
- [ ] **Step 2: 실패 확인** — `./gradlew test --tests '*FacilityBooking*'` FAIL
- [ ] **Step 3: 구현** — 스펙 §1 그대로(V85 는 ADD COLUMN NOT NULL DEFAULT '' 후 DROP DEFAULT).
- [ ] **Step 4: 전체 스위트** — `./gradlew test` BUILD SUCCESSFUL(전 건수 보고)
- [ ] **Step 5: 커밋** — `feat(backend): 시설 예약 대표 연락처 저장·관리자 노출 (V85)`

---

### Task 2: 프론트 — 입력란·확인 Dialog·상세 표기

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`(create 파라미터·상세 타입 contactPhone)·`packages/api/src/client.ts`(전송)·훅 필요 시
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingForm.tsx`(입력란·프리필·Dialog 트리거)
- Create: `frontend/apps/web/app/facilities/_components/booking/BookingConfirmDialog.tsx`
- Modify: 관리자 콘솔 상세·`manage` 상세 모달(대표 연락처 행)
- Test: `booking-components.test.tsx`·`facility-booking-page.test.tsx`(Dialog 경유 제출 플로우 — 확인 전 미전송 단언)·admin/manage 테스트 파급

**Interfaces (Consumes):** Task 1 계약. 프리필은 /users/me 응답에 휴대폰 필드가 실재할 때만(없으면 생략·리포트 기록).

- [ ] **Step 1: 실패 테스트 (RED)** — (a) 연락처 미입력/형식 오류 시 Dialog 안 열림+한국어 오류, (b) "예약 신청" → Dialog(시설·일시·동아리·목적·인원 "—"·연락처·고정 안내) 열림 + **msw POST 미발사 단언**, (c) Dialog [예약 신청] → POST 1회(contactPhone 포함 payload)·성공 화면, (d) [취소] → 폼 유지·미전송, (e) 관리자/manage 상세 "대표 연락처" 행(null → "—").
- [ ] **Step 2: 실패 확인** — 대상 테스트 FAIL
- [ ] **Step 3: 구현** — 스펙 §2 그대로. Dialog 는 components/ui/dialog + `.duing` 재부여, 제출 중 버튼 비활성.
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 예약 신청 확인 다이얼로그·대표 연락처 입력 추가`
