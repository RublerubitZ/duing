# 동아리 상태 노출 정책 후속 정합화 설계 스펙 (Part A~C)

- 작성일: 2026-07-07
- 상태: 확정 — 사용자 검토 4건 반영 (모집 종료 벌크 UPDATE 명시 · 403 메시지 상태별 구분 · 운영 행위 API 범위 구체화 · D6 신설: INACTIVE 프로필 수정 정책)
- 전제: PR #591(백엔드)·#592(웹) 머지 완료 기준. `ClubStatus` = PENDING_APPROVAL / ACTIVE / INACTIVE / REJECTED, 삭제는 별도 상태가 아닌 soft delete(`deletedAt` + `@SQLRestriction`).
- 배경: #591/#592 는 학생 노출 표면(마이페이지 목록·공개 상세·동아리별 모집·사진·찜)을 ACTIVE 로 제한했다. 당시 adversarial 리뷰에서 확인됐지만 정책 결정이 선행돼야 해 의도적으로 분리한 잔여 3개 영역을 이 스펙이 다룬다.

## Out of Scope (명시적 제외)

- ACTIVE 동아리 삭제 정책 변경 — "운영 중단 후 삭제" 2단계 유지
- 재활성(INACTIVE→ACTIVE) 시 마감된 모집의 자동 복구 — 운영 재개 시 새 모집을 개설한다 (Part A 결정의 귀결)
- 알림 도메인 전반 재설계 — 마감 임박 알림의 후보 쿼리 필터만 다룬다
- admin 콘솔 화면 변경 — 백엔드 정책 정합화가 중심이며, FE 는 기존 오류 메시지 표시 경로를 그대로 사용
- OpenAPI 생성 타입(`schema.d.ts`) 재생성 — 별도 chore PR 로 진행
- 총동연(ADMIN)의 조회 권한 축소 — admin 은 모든 상태 열람 유지

---

## Part A (P1) — 운영 중단 동아리의 모집 정리

### 현황 (코드 근거)

- `GeneralClubService.updateStatus` 는 ACTIVE→INACTIVE 전환 시 해당 동아리의 OPEN 모집을 건드리지 않는다. 폐쇄(`GeneralClubClosureService.close`)만 모집을 정리한다.
- 공개 모집 달력 `GET /api/v1/recruitments?yearMonth=` 와 공개 모집 상세 `GET /api/v1/recruitments/{id}` 는 모집이 속한 동아리의 status 를 확인하지 않는다 (`RecruitmentRepositoryImpl` — soft delete 만 필터).
- `DeadlineNotificationJob` 의 후보 쿼리(`RecruitmentRepository.findDeadlineNotificationCandidates`)도 `r.status='OPEN'` + soft delete 만 거른다 → **운영 중단된 동아리의 D-3/D-1/D-0 마감 임박 알림이 찜 유저에게 발송되고, 알림 링크는 404 가 되는 공개 상세를 가리킨다** (실해악 있는 P1).
- 홈 모집 칩·캘린더 FE 는 위 API 결과를 그대로 렌더하므로 백엔드 필터로 함께 해결된다.
- REJECTED/PENDING_APPROVAL 동아리는 ACTIVE 를 거치지 않으면 모집이 존재할 수 없으므로(모집 생성은 운영진 콘솔 = ACTIVE 전용 화면), 이 파트의 실질 대상은 INACTIVE 전환 케이스다.

### 정책 결정 포인트

- **D1. 운영 중단 전환 시 OPEN 모집을 자동 마감(CLOSED)하는가?**
  - **확정: 예.** 운영 중단은 "신규 모집 활동 정지"가 자연스럽고, 조회 필터만으로는 "지원 가능해 보이는 OPEN 모집" 데이터가 남아 어드민 화면·통계·향후 쿼리에서 계속 함정이 된다. 재개 시 새 모집을 열면 된다 (Out of Scope 참조).
  - 대안: 조회 필터만 적용하고 모집은 OPEN 유지 — 재활성 시 모집이 되살아나는 게 장점이지만, 마감일이 지난 채 부활하는 등 상태 불일치 함정이 더 크다.
- **D2. 자동 마감 시 진행 중(SUBMITTED 등) 지원서 처리는?**
  - **확정: 미변경(그대로 둔다).** 폐쇄 cascade 는 지원서를 REJECTED 로 강제 전환하지만, 운영 중단은 되돌릴 수 있는 상태라 지원서까지 파괴적으로 처리하지 않는다. CLOSED 모집의 지원서 열람·처리 정책은 기존과 동일.

### 설계 (D1=예 기준)

1. **전환 오케스트레이션**: `GeneralClubService.updateStatus` 에서 `next == INACTIVE` 일 때 `recruitmentService.closeAllOnClubDeactivation(clubId)` 호출 (신규 메서드 — OPEN 모집을 CLOSED 로 전환만 하고 soft delete 는 하지 않음. 폐쇄용 `closeAllOnClubClosure` 와 의미 분리). 상시모집(endDate null)도 동일하게 CLOSED.
   - **구현은 벌크 UPDATE 1문으로 확정** (모집 엔티티를 개별 로드해 dirty checking 하지 않는다 — 성능·단순성):
     `UPDATE recruitment SET status = 'CLOSED' WHERE club_id = :clubId AND status = 'OPEN' AND deleted_at IS NULL`
   - ⚠️ 벌크 연산에는 `@SQLRestriction` 이 적용되지 않으므로 **`deleted_at IS NULL` 을 반드시 명시** (프로젝트 확립 규칙). `@Modifying(clearAutomatically = true)` 로 같은 트랜잭션(행 잠금 하 updateStatus)의 1차 캐시와 벌크 결과 불일치를 방지.
   - `updateStatus` 는 이미 행 잠금(`findByIdForUpdate`) + `@Transactional` 쓰기 메서드라 폐쇄와의 경합은 기존 직렬화가 커버한다.
   - ⚠️ `GeneralClubService` 는 클래스 레벨 `@Transactional(readOnly = true)` — 오케스트레이션 확장이 readOnly 트랜잭션에 감싸이지 않는지 재확인 (updateStatus 자체는 쓰기 override 존재, 실 PG 통합 테스트 필수).
2. **조회 방어선(이중화)**: 공개 달력·공개 모집 상세·마감 임박 알림 후보 쿼리 3곳에 `club.status = 'ACTIVE'` 조건 추가. 공개 상세는 비 ACTIVE 소속이면 404 (존재 은닉 — #591 의 `ClubNotFoundException`/`RecruitmentNotFoundException` 패턴).
3. FE 변경 없음.

### 테스트

- 통합: ACTIVE 동아리(OPEN 모집 보유) → INACTIVE 전환 → 모집이 CLOSED 로 전환되고 지원서 상태는 불변, 공개 달력에서 사라지고 모집 상세 404, 알림 후보 쿼리에서 제외
- 통합: INACTIVE 전환 후 재활성 → 모집은 CLOSED 유지(자동 부활 없음)
- 회귀: 폐쇄 cascade 는 기존 동작 유지 (`AdminClubClosureControllerTest`)
- 알림: `DeadlineNotificationJob` 후보에서 INACTIVE 동아리 모집 제외 (기존 잡 테스트 패턴 준수, 하드코딩 미래 날짜 금지 — 상대 날짜 사용)

---

## Part B (P1: 회비 계좌 / P2: 나머지) — 멤버 전용 내부 영역 접근

### 현황 (코드 근거)

`ClubAuthService.requireMember(userId, clubId)` 는 멤버십만 확인하고 club status 를 보지 않는다. 따라서 비 ACTIVE 동아리의 기존 멤버가 직접 URL/API 로 다음을 계속 조회할 수 있다:

- `GET /clubs/{id}/membership`, `GET /clubs/{id}/notices`, `GET /clubs/{id}/events`
- `GET /clubs/{id}/fee-account` — **복호화된 회비 계좌번호 반환 (민감, P1)**

마이페이지(#592)에서 비 ACTIVE 동아리가 숨겨져 정상 진입 경로는 없지만, API 레벨은 열려 있다.

### 정책 결정 포인트

- **D3. 비 ACTIVE 동아리의 기존 멤버 내부 영역 접근을 허용하는가?**
  - **확정: 전면 차단 (`requireActiveMember` 도입).** 근거: ① 정책 단순 일관 — "학생에게 비 ACTIVE 는 어떤 형태로도 노출 금지"의 자연 연장 ② 정상 UI 진입 경로가 이미 없어 실사용자 피해 없음 ③ 재활성 시 자동 복귀. 특히 회비 계좌는 민감도상 즉시(P1) 차단.
  - 대안: 공지·일정 등 읽기는 "과거 기록 열람권"으로 허용하고 쓰기·민감(회비)만 차단 — 멤버 친화적이지만 엔드포인트별 예외 매트릭스가 생겨 유지보수 비용 증가.
- **D4. 차단 시 응답 코드는?**
  - **확정: 403 + 상태별 한글 메시지.** 본인이 소속했던 동아리라 존재 은닉(404)이 무의미하고, 사용자에게 이유를 알려주는 편이 낫다. (공개 표면의 404 존재 은닉과 구분되는 지점 — 멤버는 이미 존재를 안다.)
  - 메시지는 상태별로 구분하며, **#592 마이페이지 안내 문구와 동일 문안으로 통일**한다 (FE·BE 사용자 대면 문구 일치):

    | club.status | 403 메시지 |
    |---|---|
    | PENDING_APPROVAL | 승인 대기 중인 동아리입니다. |
    | REJECTED | 거절된 동아리입니다. |
    | INACTIVE | 운영 종료된 동아리입니다. |

  - 구현: `ClubException` 계열이 아닌 인가 예외로 — `ClubAuthService` 의 기존 `AccessDeniedException` 패턴에 상태별 메시지를 얹거나, `ClubMemberException` 컨벤션(`{Domain}Exception` static inner)에 `InactiveClubAccessException(ClubStatus)` 형태로 추가해 403 매핑. 구현 계획에서 기존 예외 계층 확인 후 확정.

### 설계 (D3=전면 차단 기준)

1. `ClubAuthService` 에 `requireActiveMember(userId, clubId)` 추가 — 기존 `requireMember` 수행 후 club status != ACTIVE 면 `AccessDeniedException`(403) 계열 예외 (메시지: 상태별 한글 안내). 단일 진입점 원칙 유지.
2. 멤버 읽기 컨트롤러들의 `requireMember` 호출을 `requireActiveMember` 로 교체 — 구현 시 `requireMember` 호출처 전수 grep 후 적용 대상 목록을 계획서에 확정 (fee-account 는 1차 PR, 나머지는 2차).
3. 리더/운영진용 `requireManager`/`requireLeader` 는 Part C 에서 다룬다 (혼합 금지).

### 테스트

- 통합: INACTIVE 동아리 멤버가 notices/events/membership/fee-account 호출 → 403 + 한글 메시지, ACTIVE 는 기존 동작
- 회귀: admin·공개 표면 무영향

---

## Part C (P2) — 리더 쓰기 API 의 ACTIVE 게이트

### 현황 (코드 근거)

`requireManager`/`requireLeader` 도 club status 를 보지 않아, 비 ACTIVE 동아리의 리더가 모집 생성(`POST /leader/clubs/{id}/recruitments`), 사진 업로드 등 쓰기 API 를 직접 호출할 수 있다 (#591 이전부터의 동작). 운영진 콘솔 목록(`findActiveManagedClubsByUser`)이 ACTIVE 만 노출해 정상 진입 경로는 없다.

### 정책 결정 포인트

- **D5. 어떤 쓰기까지 ACTIVE 를 요구하는가?**
  - **확정: "운영 행위"는 ACTIVE 전용, "프로필 보완"은 별도 매트릭스(D6).**
  - 운영 행위의 구체 범위 — `requireManager`/`requireLeader`/`requireOfficer` 호출처 전수 grep(2026-07-07, main 소스 25개 파일) 기준으로 **아래 도메인 서비스/컨트롤러 전부가 ACTIVE 전용 대상**이다. 구현 계획서는 이 표를 파일 단위 체크리스트로 확장하고, 누락 방지를 위해 구현 후 동일 grep 재실행으로 대조한다:

    | 분류 | 대상 (호출처 파일 기준) |
    |---|---|
    | 모집 | `GeneralRecruitmentService`(CUD·마감), `GeneralRecruitmentStatsService`(운영진 통계) |
    | 지원/평가 | `GeneralApplicationService`(지원자 열람·상태 처리), `GeneralApplicationEvaluationService` |
    | 면접 | `GeneralInterviewRoundService`, `GeneralInterviewAssignmentService`, `InterviewRoundAccessor` |
    | 멤버 관리 | `GeneralClubMemberCommandService`(역할 변경·제명·승계), `GeneralClubMemberQueryService`(운영진용 멤버 목록·CSV) |
    | 공지/일정 | `LeaderClubNoticeController`(작성 경로), `ClubEventWriteController` |
    | 회비/회계 | `GeneralFeeAccountService`, `GeneralFeePolicyService`, `GeneralFeeBillService`, `GeneralFeeBillSummaryService`, `GeneralPaymentService`, `GeneralReceiptService`·`ReceiptService`, `GeneralBankTransactionReviewService`, `GeneralBankTransactionSyncService`, `GeneralCashbookService` |
    | 홍보/재인증 | `GeneralPromotionRequestService`(홍보 신청), `LeaderRecertificationController`(재인증 제출 — 어차피 ACTIVE 중앙동아리 전제) |
    | 프로필 (D6 매트릭스 적용) | `GeneralClubService.update`(정보 수정), `GeneralClubPhotoService`(사진 CUD) |

  - 대안(전면 ACTIVE 요구)은 재심사 보완 흐름이 깨지므로 기각.
- **D6. 프로필(정보·사진) 수정을 상태별로 어디까지 허용하는가?** (신설 — INACTIVE 를 재심사군과 동일 취급할지 명확화)
  - **확정: PENDING_APPROVAL·REJECTED·ACTIVE 허용, INACTIVE 차단.**

    | club.status | 프로필(정보·사진) 수정 | 근거 |
    |---|---|---|
    | PENDING_APPROVAL | 허용 | 승인 심사 자료 보완 |
    | REJECTED | 허용 | "보완 후 재심사 대기 전환" 흐름의 전제 |
    | ACTIVE | 허용 | 정상 운영 |
    | INACTIVE | **차단** | 재심사 목적이 없고, Part B(멤버 내부 영역 전면 차단)와 정합 — 운영 중단 동아리는 리더에게도 읽기 전용. 재활성 후 수정 가능 |

  - 구현: 프로필 경로는 `requireActiveManager` 가 아닌 `requireEditableClubManager`(가칭 — PENDING/REJECTED/ACTIVE 허용) 를 별도로 두어 정책 차이를 이름으로 드러낸다. 403 메시지는 D4 표와 동일 문안.

### 설계 (D5·D6 기준)

1. `ClubAuthService` 에 `requireActiveManager` / `requireActiveLeader`(운영 행위용 — ACTIVE 전용) 와 `requireEditableClubManager`/`requireEditableClubLeader`(프로필용 — PENDING_APPROVAL·REJECTED·ACTIVE 허용) 추가. Part B 의 `requireActiveMember` 와 동일 패턴, 403 + D4 상태별 메시지.
2. D5 표의 운영 행위 대상 전부의 기존 `requireManager`/`requireLeader` 호출을 `requireActive*` 로, 프로필 대상 2곳(`GeneralClubService.update`, `GeneralClubPhotoService` 쓰기 메서드)을 `requireEditable*` 로 교체. 구현 후 grep 재실행으로 미교체 호출처 0건을 확인해 누락을 차단.
3. 폐쇄 진행 중 경합(폐쇄 트랜잭션과 리더 쓰기의 동시 실행으로 폐쇄된 동아리에 하위 리소스가 남는 창)은 이 게이트로 대부분 닫히지만, 완전 차단이 필요하면 쓰기 경로도 `findByIdForUpdate` 를 잡는 후속 검토 항목으로 남긴다 (이번 범위 아님 — 저빈도·admin+leader 동시 조작 전제).

### 테스트

- 통합: INACTIVE/REJECTED 동아리 리더의 모집 생성 → 403 (상태별 메시지 검증)
- 통합: REJECTED/PENDING_APPROVAL 리더의 정보 수정·사진 업로드 → 허용 (재심사·심사 보완 흐름 회귀 방지)
- 통합: INACTIVE 리더의 정보 수정·사진 업로드 → 403 "운영 종료된 동아리입니다." (D6)

---

## 구현 순서 제안 (1단위 = 1브랜치 = 1PR)

| 순서 | 범위 | 우선순위 |
|---|---|---|
| PR-1 | Part A 전체 (모집 자동 마감 + 조회 방어선 + 알림 필터) | P1 |
| PR-2 | Part B 중 fee-account 차단 + `requireActiveMember` 신설 | P1 |
| PR-3 | Part B 나머지 내부 영역 적용 | P2 |
| PR-4 | Part C (운영 행위 게이트) | P2 |

각 PR 은 spec+quality 리뷰 + codex 리뷰, 상태전이·권한 해당이므로 adversarial 리뷰 포함.

## 리스크 / 체크포인트

- Part A 의 자동 마감은 상태전이 오케스트레이션 확장 — readOnly 트랜잭션 함정과 행 잠금 하 트랜잭션 길이 증가(모집 벌크 업데이트 포함)를 실 PG 통합 테스트로 검증
- Part B/C 의 403 전환은 API contract 변경 — 기존 FE 가 해당 경로를 정상 흐름에서 호출하지 않는지 FE 코드 grep 으로 선행 확인 (마이페이지·운영진 콘솔이 이미 ACTIVE 만 노출하므로 이론상 무영향이지만 검증 필수)
- `requireActive*` 는 멤버십 조회에 이어 club 조회가 추가되는 경로 — N+1 이 아닌 단건 exists 로 구현 (`existsByIdAndStatus` 재사용)
