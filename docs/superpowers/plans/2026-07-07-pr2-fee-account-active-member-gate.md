# PR-2: requireActiveMember 신설 + 회비 계좌 차단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** 비 ACTIVE 동아리의 기존 멤버가 복호화된 회비 계좌(`GET /clubs/{id}/fee-account`)를 조회할 수 없게 한다 — `ClubAuthService.requireActiveMember` 신설(403 + 상태별 한글 메시지, D4 표) 후 멤버용 회비 계좌 조회에 적용. 스펙 Part B 의 P1 조각 (나머지 내부 영역은 PR-3).

**설계 (정찰 확정):**
- `ClubMemberException` 은 `ApplicationException(message, status)` 계열이라 **상태별 메시지가 403 응답 본문에 그대로 실림** (AccessDeniedException 은 핸들러가 "권한이 없습니다." 로 평탄화하므로 부적합 — D4 의 "기존 예외 계층 확인 후 확정" 결론).
- club 상태는 `clubMember.getClub().getStatus()` 로 읽음 — ClubAuthService 에 새 리포지토리 의존 불필요, 멤버십 조회에 이은 단건 lazy load 1회.
- 적용 대상은 `GeneralFeeAccountService.getForMember`(:65, requireMember 사용) 1곳. `getForManager`/`upsert`/`delete` 는 운영 행위로 Part C(PR-4) 몫 — 변경 금지.

**Out of Scope:** 공지/일정/membership 등 나머지 멤버 내부 영역(PR-3), 리더/운영진 게이트(PR-4), FE 변경 없음.

---

## Task 1: requireActiveMember + 회비 계좌 적용 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java` (NotActiveClub 추가)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java` (requireActiveMember 추가)
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java` (getForMember 교체)
- Test: 기존 fee-account 멤버 조회 테스트 파일(구현 시 grep 으로 확정) + ClubAuthService 단위/통합 테스트 전례 확인

- [ ] **Step 1: 실패하는 테스트** — 기존 fee-account 멤버 조회 테스트 파일에 상태별 3케이스(@EnumSource 또는 개별): ACTIVE 동아리 멤버 정상 조회 유지 + INACTIVE/REJECTED/PENDING_APPROVAL 전환(직접 SQL) 후 403 + **D4 표의 정확한 메시지** 단언 ("승인 대기 중인 동아리입니다." / "거절된 동아리입니다." / "운영 종료된 동아리입니다.").
- [ ] **Step 2: 실패 확인** (403 대신 200)
- [ ] **Step 3: 구현**

`ClubMemberException` 에 추가:
```java
    /** 비 ACTIVE 동아리의 멤버 내부 영역 접근 차단 (스펙 Part B · D3/D4). 메시지는 #592 마이페이지 문구와 통일. */
    public static final class NotActiveClub extends ClubMemberException {
        public NotActiveClub(ClubStatus clubStatus) {
            super(messageFor(clubStatus), HttpStatus.FORBIDDEN);
        }

        private static String messageFor(ClubStatus clubStatus) {
            return switch (clubStatus) {
                case PENDING_APPROVAL -> "승인 대기 중인 동아리입니다.";
                case REJECTED -> "거절된 동아리입니다.";
                default -> "운영 종료된 동아리입니다.";
            };
        }
    }
```
(`com.duing.domain.club.entity.ClubStatus` import)

`ClubAuthService` 에 추가 (requireMember 아래):
```java
    /**
     * 멤버십과 동아리 운영 상태(ACTIVE)를 함께 요구한다 — 비 ACTIVE 동아리의 멤버 내부 영역
     * 접근 차단 (스펙 Part B). 소속 멤버에게는 존재 은닉이 무의미하므로 404 가 아닌 403 + 상태별 안내.
     */
    public ClubMember requireActiveMember(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        ClubStatus clubStatus = clubMember.getClub().getStatus();
        if (clubStatus != ClubStatus.ACTIVE) {
            throw new ClubMemberException.NotActiveClub(clubStatus);
        }
        return clubMember;
    }
```

`GeneralFeeAccountService.getForMember` — `clubAuthService.requireMember(actorId, clubId)` → `requireActiveMember`.

- [ ] **Step 4: 통과 확인** — fee 도메인 전체 + clubmember 전체 테스트, BUILD SUCCESSFUL 직접 확인
- [ ] **Step 5: 커밋** — `feat(backend): 비 ACTIVE 동아리 회비 계좌 조회 차단 (requireActiveMember 신설)`

## Task 2: 전체 테스트 + PR
- [ ] `./gradlew test` BUILD SUCCESSFUL, self-check 7항목, push + PR 생성 (머지 금지)
