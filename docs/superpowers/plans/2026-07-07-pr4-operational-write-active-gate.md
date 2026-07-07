# PR-4: 운영 행위 ACTIVE 게이트 (Part C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** 비 ACTIVE 동아리에서 리더/운영진의 "운영 행위"(모집·지원·면접·멤버 관리·공지·일정·회비·회계·홍보·재인증)를 차단하고, "프로필 보완"(동아리 정보·사진)은 D6 매트릭스(PENDING_APPROVAL·REJECTED·ACTIVE 허용, INACTIVE 차단)를 적용한다. 스펙 Part C 완결.

**메커니즘 결정 (스펙 대비 의도된 편차 — PR 리뷰에서 확인 요망):**
확정 스펙 D5 는 `requireActiveManager` 신설 + 호출부 76곳 교체 + grep 재실행 대조를 제안했다. 본 계획은 **기존 `requireLeader`/`requireManager`/`requireOfficer` 에 ACTIVE 게이트를 내장**하고, 프로필 경로 2파일(5곳)만 `requireEditableClubLeader`/`requireEditableClubManager` 로 교체한다.
- 근거: ① 사용자 검토의견의 핵심(누락 방지)에 구조적으로 가장 강함 — 76곳 교체 누락 위험 자체가 소멸하고, **미래에 추가되는 운영 행위도 자동으로 게이트**됨(fail-safe 기본값) ② 프로덕션 변경 76곳→7곳 ③ D5 의 "운영 행위 전부 ACTIVE 전용" 정책과 의미 동일, D6 의 "정책 차이를 이름으로 드러낸다" 의도는 requireEditable* 신설로 유지
- 검증: 구현 후 D5 표(76곳)를 grep 재실행으로 대조 — 프로필 5곳 외 전부가 기본 게이트 경유임을 확인

**정찰 확정 사실:**
- 호출부 76곳/25파일 (D5 표와 일치). 프로필 예외 = `club/service/GeneralClubService.java:157`(update, requireLeader), `club/photo/service/GeneralClubPhotoService.java:47,62,70,106`(사진 CUD, requireManager)
- 모집 create/replaceActive 는 PR-1 의 행 잠금 + `requireActiveClub(Club)` 이 이미 원자적 게이트 — 유지 (requireManager 내장 게이트와 중복되지만 잠금 하 판정이 더 강함, 주석으로 관계 명시)
- club 상태 판정은 PR-2 하드닝 패턴(`clubRepository.findById` 경유, 삭제된 동아리 잔존 멤버십 → NotAMember) 재사용 — ClubAuthService 에 이미 ClubRepository 주입됨
- 403 메시지는 PR-2 의 `NotActiveClub` 재사용 (상태별 문구 기확정)
- **예상 파급**: 다수 통합 테스트가 PENDING 기본 픽스처로 리더 쓰기를 수행 → 403 으로 깨짐. PR-2/3 전례대로 setUp ACTIVE 승격(주석 필수)으로 수습 — 전체 테스트를 돌려 깨진 파일을 전수 승격

**Out of Scope:** 알림 이력 잔존(발행 시점 스냅샷 정책 — Part B 에서 문서화), draft find 존재 은닉, FE 변경(운영진 콘솔은 이미 ACTIVE 만 노출 — 403 은 방어선).

---

## Task 1: ClubAuthService 게이트 내장 + Editable 변형 (TDD)

**Files:** `clubmember/service/ClubAuthService.java`, `clubmember/service/ClubAuthServiceTest.java`(단위)

- [ ] private 헬퍼 신설:
```java
    /** 운영 행위 공통 게이트 — 비 ACTIVE 동아리에서는 운영 행위를 차단한다 (스펙 Part C · D5). */
    private void requireActiveClub(Long clubId) {
        ClubStatus clubStatus = resolveClubStatusOrThrow(clubId);
        if (clubStatus != ClubStatus.ACTIVE) {
            throw new ClubMemberException.NotActiveClub(clubStatus);
        }
    }

    /** 프로필 보완 게이트 — 재심사 보완(PENDING_APPROVAL·REJECTED)은 허용, 운영 종료(INACTIVE)만 차단 (D6). */
    private void requireEditableClub(Long clubId) {
        ClubStatus clubStatus = resolveClubStatusOrThrow(clubId);
        if (clubStatus == ClubStatus.INACTIVE) {
            throw new ClubMemberException.NotActiveClub(clubStatus);
        }
    }

    /** soft-delete 된 동아리의 잔존 멤버십은 비멤버로 취급 (PR-2 하드닝과 동일). */
    private ClubStatus resolveClubStatusOrThrow(Long clubId) {
        return clubRepository.findById(clubId)
                .map(Club::getStatus)
                .orElseThrow(ClubMemberException.NotAMember::new);
    }
```
- [ ] `requireLeader`/`requireManager`/`requireOfficer` — 역할 검증 **후** `requireActiveClub(clubId)` 호출 추가, javadoc 에 "운영 행위 기본 게이트 — 비 ACTIVE 차단 (Part C)" 명시. `requireActiveMember` 는 기존 로직 유지(내부적으로 resolveClubStatusOrThrow 재사용으로 정리 가능).
- [ ] 신설 public: `requireEditableClubLeader(userId, clubId)` = 리더 역할 검증 + requireEditableClub / `requireEditableClubManager(userId, clubId)` = 운영진 역할 검증 + requireEditableClub. javadoc 에 D6 매트릭스 명시.
- [ ] 단위 테스트(ClubAuthServiceTest, mock): 각 게이트의 상태별 허용/차단 매트릭스 (requireManager: INACTIVE/REJECTED/PENDING 차단·ACTIVE 허용 / requireEditableClubManager: INACTIVE 만 차단), 역할 검증이 상태 검증보다 먼저(비멤버에 상태 유출 없음), 삭제된 동아리 → NotAMember.
- [ ] 커밋: `feat(backend): 운영 행위 인가에 동아리 ACTIVE 게이트 내장 및 프로필 보완 게이트 신설`

## Task 2: 프로필 경로 교체 (D6)

**Files:** `club/service/GeneralClubService.java:157`, `club/photo/service/GeneralClubPhotoService.java:47,62,70,106` + 관련 테스트

- [ ] update → `requireEditableClubLeader`, 사진 CUD 4곳 → `requireEditableClubManager` 로 교체.
- [ ] 통합 테스트: REJECTED 리더의 정보 수정·사진 업로드 **허용**(재심사 보완 흐름 회귀 방지 — 핵심), PENDING 허용, INACTIVE 403 "운영 종료된 동아리입니다.".
- [ ] 커밋: `feat(backend): 동아리 프로필 수정에 D6 보완 게이트 적용 (INACTIVE 차단·재심사 보완 허용)`

## Task 3: 파급 수습 + 대표 통합 테스트 + 대조

- [ ] 전체 테스트 실행 → PENDING 픽스처로 깨진 테스트 파일 전수 확인 → setUp ACTIVE 승격(PR-2/3 과 동일 주석) 반복. **단, 깨진 테스트가 "비 ACTIVE 에서 성공해야 하는 시나리오"를 검증 중이면 승격이 아니라 정책 충돌 — BLOCKED 보고.**
- [ ] 대표 운영행위 통합 테스트 4개 신규 (INACTIVE 전환 후): 공지 작성 403, 일정 생성 403, 멤버 역할 변경 403, 회비 청구 생성 403 — 각 도메인 기존 테스트 파일에 추가.
- [ ] grep 재실행: `requireManager|requireLeader|requireOfficer` 호출부가 D5 표와 일치하고 전부 게이트 경유인지 대조, `requireEditable*` 는 프로필 5곳뿐인지 확인 — 결과를 보고에 첨부.
- [ ] 커밋: `test(backend): 운영 행위 게이트 통합 테스트 및 픽스처 상태 정리`

## Task 4: 전체 테스트 + PR
- [ ] `./gradlew test` BUILD SUCCESSFUL, self-check 7항목(EOF 는 저장소 루트에서 검사), push + PR (머지 금지)

**리뷰 파이프라인:** Task 별 spec+quality 리뷰, codex 리뷰 + **브랜치 adversarial 1회 필수** (권한 전면 변경). PR 본문에 메커니즘 편차(기본 게이트 내장)를 명시해 사용자 확인 유도.
