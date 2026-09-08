# 동아리 활동 이력(상태·가입 링크·부원 초대) 관리자 로그 + 자동승인 초대 Slack 신호

작성 2026-09-08. 선행: `docs/join-code-invite-spec.md`(부원 초대 링크, #916/#917), 회비 감사 콘솔(#893, `club_audit_event` 조회 선례), Slack 운영 모니터링(#1046).

## 0. 요구 (구속)

사용자 결정(2026-09-08):

1. **부원 초대 링크도 관리(이력 열람)할 수 있게** — 모집 가입 링크와 함께 생성·재생성·폐기 이력이 보여야 한다.
2. **동아리 상태 추적 로그 고도화** — 승인·거절·운영중단·재개·폐쇄 전이가 최신 1건이 아니라 이력으로 남아야 한다.
3. **초대 링크 알림은 인앱이 아니라 Slack** — 발급 전부가 아니라 **자동승인(autoApprove) 초대 발급**에만 보낸다.
4. **1차 사용자 = 총동연(ADMIN) + 개발자.** 화면은 **동아리별** "활동 이력" 페이지. 전 동아리 통합 타임라인은 이번에 만들지 않는다.
5. **가입 요청 3종(JOIN_REQUEST_*)은 화면에 싣지 않는다** — 행위자가 학생이라 이름이 노출되고, 결과는 부원 이력에 이미 반영된다.
6. **사유(거절·폐쇄)는 DB 에 남기고 관리자 화면에 보인다. Slack 에는 싣지 않는다**(기존 원칙).
7. **기존 Slack 메시지 중 동아리 ID 만 있고 동아리명이 없는 것은 동아리명도 싣는다.**

## 1. 현재 상태에서 확인한 사실

| 항목 | 사실 |
|---|---|
| 감사 테이블 | `club_audit_event`(V102). 컬럼: `club_id`(FK club) · `event_type`(CHECK, V116 이 최신 목록) · `actor_user_id`(FK users) · `recruitment_id` · `join_code_id` · `join_request_id` · `application_id` · `reason`(500) · 회비 참조 4종 · `detail`(jsonb) · `created_at`. 인덱스 `(club_id, created_at)` |
| 가입 링크 이력 | `JOIN_LINK_CREATED / REGENERATED / REVOKED` 가 `GeneralJoinCodeService.recordJoinLinkEvent` 로 이미 기록됨. **부원 초대(CLUB_INVITE)도 같은 이벤트**로 남는다(`recruitmentId == null` 이 초대). detail 은 항상 null → 자동승인 여부·정원·만료는 이력에 없음 |
| 부원 초대 ↔ 모집 링크 | 같은 `club_join_code` 테이블의 두 형태. 판별 `ClubJoinCode.isClubInvite()` = `recruitment == null`. 초대는 `autoApprove`, `inviteExpiresAt`(24/72h), `maxUses` 를 가짐 |
| 이력 조회 경로 | `ClubAuditEventRepositoryCustom.searchFeeEvents(clubId, types, from, to, pageable)` — 이름만 회비이고 술어는 범용(javadoc 명시). `clubId` 는 `requireNonNull`(동아리 격리). 호출자 3곳(`GeneralAdminFeeAuditQueryService.getAuditLogs`, `GeneralAdminFeeAnomalyService` 2곳) 모두 `FEE_*` 로만 필터 → **JOIN_LINK_* 를 읽는 코드 0곳**. 인덱스 `(club_id, event_type, created_at)` 은 V105 에 이미 있어 새 조회에 추가 인덱스 불필요 |
| 동아리 상태 | `Club.status_changed_by/at` 덮어쓰기 + `changeStatus` 가 REJECTED 외 전이에서 `rejectionReason` 을 null 로 지움 → 이력·이전 사유 소실. Slack(`ClubStatusChangedEvent`, `ClubClosedEvent`)은 휘발성 |
| 상태 변경 지점 | `GeneralClubService.updateStatus`(행 잠금 → `changeStatus` → Slack 이벤트 → INACTIVE 면 모집 일괄 마감). 폐쇄 `GeneralClubClosureService.close`(잠금 → 연쇄 정리 → `flush(); clear();` → soft-delete → Slack 이벤트) |
| 사유 길이 | `UpdateClubStatusRequest.rejectionReason`·`CloseClubRequest.closureReason` 모두 `@Size(max=500)`. 폐쇄 사유는 공백이면 "동아리 폐쇄" 로 정규화됨 → `club_audit_event.reason`(500) 에 그대로 들어간다 |
| detail 생성 | `AuditDetailJson.of(Map<String,Object>)` 헬퍼 존재. 회비 이벤트가 before/after 스냅샷에 사용 |
| 관리자 동아리 화면 | `/admin/clubs`(목록) · `/admin/clubs/[clubId]`(상세, 130~135행에 "권한 변경 이력 →" 링크) · `/admin/clubs/[clubId]/member-history`(이력 페이지 선례: 헤더 + 표 + Pagination, 훅 `useAdminClubMemberHistoryQuery`, API `GET /admin/clubs/{clubId}/member-history`) |
| 회비 로그 화면 선례 | `admin/fees/_components/FeeAuditLogList.tsx`(칩 필터 + 행 나열 + `formatAuditDetail`), 응답 `AdminFeeAuditLogResponse`(actorName 조인, `detail` 은 `@JsonRawValue` 원문 통과, `createdAt` 은 `TimeMapper.systemWallClockToInstant`) |
| Slack | `OpsSlackListener`(AFTER_COMMIT + @Async) → `OpsSlackMessageFormatter`(이벤트 record 명시 필드만 조립, 자유 텍스트 미노출). 동아리명 없는 메시지: `FEE_ACCOUNT_CREATED`, `FACILITY_BOOKING_SUBMITTED / REJECTED / CANCELLED / CONFLICT`(ClubId 만). `ADMIN_USER_ACTION` 은 회원 단위라 동아리 없음 |
| 시설 이벤트 record | `notification.event.FacilityBooking*Event` 4종은 인앱 알림 리스너도 구독한다. 리스너 javadoc: "기존 알림 도메인 이벤트는 새 record 없이 그대로 구독한다 — 발행 지점·필드 불변" |
| enum·DDL 정합 가드 | `ClubAuditEventFeeTypesTest` 가 FEE_* 15종만 CHECK 통과를 검증. 다른 타입은 가드 없음 |
| Slack 테스트 | `OpsSlackListenerTest`, `OpsSlackMessageFormatterTest`, `OpsSlackMonitoringIntegrationTest`, `SlackNotifierTest` 존재 |

## 2. 설계

### 2.1 기록 — 동아리 상태 전이를 `club_audit_event` 에 남긴다 (BE)

새 테이블을 만들지 않는다. `ClubAuditEventType` 에 2종 추가:

| 타입 | 기록 지점 | `reason` | `detail` |
|---|---|---|---|
| `CLUB_STATUS_CHANGED` | `GeneralClubService.updateStatus` — `changeStatus` 검증 통과 직후, Slack 이벤트 발행 앞 | REJECTED 전이면 거절 사유, 아니면 null | `{"from":"PENDING_APPROVAL","to":"ACTIVE"}` |
| `CLUB_CLOSED` | `GeneralClubClosureService.close` — `validateClosable()` 통과 직후(1단계 앞). `flush(); clear();` 전이라 영속성 컨텍스트가 살아 있고, soft-delete 여도 `club` 행은 남아 FK 가 성립한다 | 폐쇄 사유(정규화된 값) | null |

- 팩토리 `ClubAuditEvent.clubStatusChanged(clubId, actorUserId, reason, detail)`, `ClubAuditEvent.clubClosed(clubId, actorUserId, reason)` 추가(기존 `securedTargetChanged` 와 같은 모양).
- 마이그레이션 **V127**: `club_audit_event_event_type_check` DROP/ADD 로 V116 목록 + `CLUB_STATUS_CHANGED`, `CLUB_CLOSED`. 데이터 변경 없음, 롤백 = 제약만 되돌림.
- 동일 전이(ACTIVE→ACTIVE)는 `changeStatus` 가 이미 거부하므로 무의미한 행은 생기지 않는다.
- 주입: `GeneralClubService` 는 `ClubAuditEventRepository` 를 이미 갖고 있다. `GeneralClubClosureService` 에는 생성자 주입을 추가한다.
- `ClubAuditEventFeeTypesTest` 의 "enum·DDL 정합" 가드를 **전 타입**으로 넓힌다 — `values()` 전부를 기존 `feeAccount` 팩토리로 저장하고(CHECK 정합만 보는 테스트라 팩토리 종류는 무관), 기대 건수는 `15` 하드코딩 대신 `values().length`. 목적: 앞으로 어떤 타입을 추가해도 CHECK 누락을 즉시 잡는다.

### 2.2 기록 — 부원 초대 발급 이벤트에 detail 을 싣는다 (BE)

`GeneralJoinCodeService.createClubInvite` 의 `JOIN_LINK_CREATED / REGENERATED` 기록에만 detail 추가:

```json
{"linkType":"CLUB_INVITE","autoApprove":true,"maxUses":30,"expiresAt":"2026-09-11T14:00:00Z"}
```

- `expiresAt` 은 `TimeMapper.seoulWallClockToInstant(issued.getInviteExpiresAt())` 로 절대시각 문자열. `GeneralJoinCodeService.clock` 은 `seoulClock`(Asia/Seoul) 이라 `inviteExpiresAt` 은 **KST 벽시계**이고, 응답 경계(`JoinCodeResponse`)도 같은 환산을 쓴다. `systemWallClockToInstant` 를 쓰면 prod(JVM=UTC)에서 9시간 어긋난다.
- `maxUses` 는 항상 정수다(`ClubJoinCode.maxUses` 는 `int`, 요청은 `@NotNull @Min(1) @Max(150)`). 무제한 초대는 없다.
- `recordJoinLinkEvent` 에 detail 을 받는 오버로드를 추가하고, 기존 5개 호출은 그대로 둔다(모집 링크·폐기는 detail null 유지).
- 과거 초대 발급 행은 detail null → 화면은 "상세 없음" 으로 표시(3.4). 백필하지 않는다.
- 초대 **코드 값**은 detail·Slack 어디에도 싣지 않는다 — 코드는 가입 자격 그 자체다.

### 2.3 조회 API — 관리자 동아리 활동 이력 (BE)

`GET /api/v1/admin/clubs/{clubId}/activity-events` — `@PreAuthorize("hasRole('ADMIN')")`

| 파라미터 | 의미 |
|---|---|
| `types`(선택, 복수) | `ClubAuditEventType` 목록. **허용 집합과 교집합**만 조회한다. 비어 있거나 전부 허용 밖이면 허용 집합 전체 |
| `page`, `size` | 최신순 고정, 기본 20 |

- 기간(`from/to`) 파라미터는 **두지 않는다**. 화면에 기간 UI 가 없고(2.4), 회비 콘솔의 `AdminFeePeriod` 를 재사용하면 `clubaudit → fee` 역의존이 생긴다. 후속에서 필요하면 `TimeMapper.seoulToSystemWallClock(from.atStartOfDay())` 환산을 clubaudit 안에 두고 붙인다. 리포지토리 호출은 `createdFrom/createdTo` 에 null 을 넘긴다(기존 술어가 null 을 무조건으로 처리).
- **허용 집합** `ACTIVITY_EVENT_TYPES = {CLUB_STATUS_CHANGED, CLUB_CLOSED, JOIN_LINK_CREATED, JOIN_LINK_REGENERATED, JOIN_LINK_REVOKED}`. 회비·가입 요청·열람 타입을 `types` 에 넣어도 무시된다(회비는 회비 콘솔, 가입 요청은 요구 5).
- `types` 가 전부 허용 밖일 때 **허용 집합 전체**를 돌려주는 것은 회비 선례(`feeTypesOf`: 빈 페이지)와 **의도적으로 다르다** — 이 화면의 칩은 고정값이라 "허용 밖" 은 URL 을 직접 찌른 경우뿐이고, 그때 빈 화면보다 전체 로그가 유용하다.
- 동아리 존재 검사는 하지 않는다 — 폐쇄(soft-delete)된 동아리도 이력은 남아야 읽힌다. 없는 id 는 빈 페이지.
- 리포지토리: `searchFeeEvents` 를 `searchEvents` 로 **개명**. 영향 범위: 인터페이스·구현·호출자 3곳(`GeneralAdminFeeAuditQueryService` 1, `GeneralAdminFeeAnomalyService` 2)·관련 테스트. 술어·동아리 격리 가드는 그대로. 이유: 비회비 호출자가 생기는 순간 이름이 거짓말이 된다.
- 응답 `AdminClubActivityEventResponse`: `eventId, eventType, actorUserId, actorName(탈퇴자 null), createdAt(Instant), reason, recruitmentId, joinCodeId, detail(@JsonRawValue)`. 행위자 이름 조인은 회비 콘솔과 같은 방식(`UserRepository.findAllById` 일괄).
- 위치: `domain/clubaudit` 아래 `api/AdminClubActivityApi`(springdoc 인터페이스) + `controller/AdminClubActivityController` + `service/AdminClubActivityQueryService`(인터페이스) + `service/GeneralAdminClubActivityQueryService`(readOnly) + `service/dto/query/AdminClubActivityEventRow`. 회비 콘솔 패키지 구조를 따른다.
- 열람 감사는 남기지 않는다 — 개인정보(계좌·납부)가 없는 로그다. 행위자 이름은 운영진·총동연이고 이미 부원 이력·회비 콘솔에서 같은 수준으로 노출된다.

### 2.4 화면 — `/admin/clubs/[clubId]/activity-log` (FE)

`member-history` 페이지 구조를 그대로 따른다.

- `page.tsx` → `_pages/AdminClubActivityLogPage.tsx`(헤더 "동아리 활동 이력" + `(동아리 ID: n)` + 칩 + 리스트 + `Pagination`) + `_components/AdminClubActivityLogList.tsx`(행 나열, 표 아님 — 사유·detail 길이가 제각각인 회비 로그 선례).
- 상세 페이지(`AdminClubDetailPage.tsx` 130~135행)의 "권한 변경 이력 →" 링크 옆에 같은 형태로 "활동 이력 →" 링크 추가. 목록 표에는 추가하지 않는다.
- **API 클라이언트 단계(필수 순서, `frontend/CLAUDE.md`)**: `packages/api/src/domains/admin.ts` 에 `client.admin.clubActivity.events(clubId, params)` 추가 — `http.get(\`admin/clubs/${clubId}/activity-events\`, { searchParams: cleanParams(params) })`. `cleanParams` 가 배열을 같은 키 반복(`types=A&types=B`)으로 직렬화해 Spring `@RequestParam List<ClubAuditEventType>` 과 맞는다(`memberHistory` 선례). 훅은 이 메서드를 부른다.
- **칩**: 전체 / 상태 / 가입 링크. 서버 `types` 매핑 — 상태 → `CLUB_STATUS_CHANGED, CLUB_CLOSED`, 가입 링크 → `JOIN_LINK_*` 3종. 부원 초대와 모집 링크는 **행 라벨로 구분**한다(`recruitmentId == null` → "부원 초대 링크", 아니면 "모집 가입 링크"). 초대만 거르는 칩은 이번에 없다(Out of Scope).
- **기간**: 기간 필터는 화면·서버 모두 이번에 두지 않고 최신순 페이징만 한다(2.3).
- **행 표시**(모두 한글):
  - 라벨: `CLUB_STATUS_CHANGED` → "상태 변경 · {from 라벨} → {to 라벨}"(라벨은 `_lib/clubStatus.ts` 의 `STATUS_LABEL` 재사용) / `CLUB_CLOSED` → "동아리 폐쇄" / `JOIN_LINK_CREATED` → "{링크 종류} 발급" / `REGENERATED` → "{링크 종류} 재발급" / `REVOKED` → "{링크 종류} 폐기".
  - 부가: 행위자(`actorName`, null 이면 "탈퇴한 회원"), 시각(`formatDateTimeKst`), `reason`(있으면 "사유: …"), 초대 detail 요약("자동승인 · 정원 30 · 만료 09.11 14:00" / autoApprove false 면 "승인제"). detail 이 null 이면 요약 줄 생략.
  - `JOIN_LINK_REGENERATED` 와 같은 트랜잭션의 `REVOKED` 는 두 행으로 보인다(기록 구조 그대로). 합치지 않는다.
- 타입: `packages/types/src/adminClubActivity.ts`(`AdminClubActivityEventType` 5종 union, `AdminClubActivityEvent`, `AdminClubActivityEventsParams`). 훅: `packages/hooks/src/adminClubActivity.ts` `useAdminClubActivityEventsQuery(clubId, params)`, 쿼리키 `adminQueryKeys.clubActivityEvents`. 모두 `index.ts` 에 export.
- 로딩·오류·빈 상태는 `LoadingGate` / 기존 `ErrorState` / `EmptyState`("기록된 활동이 없습니다") 재사용.

### 2.5 Slack — 자동승인 부원 초대 발급 신호 (BE)

- 새 이벤트 `global/monitoring/event/ClubInviteAutoApproveIssuedEvent(Long clubId, String clubName, Long joinCodeId, int maxUses, LocalDateTime expiresAtKst, Long actorUserId)`. `expiresAtKst` 는 `issued.getInviteExpiresAt()`(seoulClock 벽시계) 그대로 — 포매터의 `KST_MINUTE` 이 `LocalDateTime` 을 받으므로 환산 없이 찍는다.
- 발행: `GeneralJoinCodeService.createClubInvite` 에서 `createCommand.autoApprove()` 가 true 일 때만, 감사 기록 뒤(같은 트랜잭션 안). 승인제 초대는 발행하지 않는다. `GeneralJoinCodeService` 에 `ApplicationEventPublisher` 생성자 주입 추가(현재 없음).
- `OpsSlackListener.onClubInviteAutoApproveIssued` + `OpsSlackMessageFormatter.clubInviteAutoApproveIssued` → 헤더 "⚠️ 자동승인 부원 초대 링크 발급", 필드: 동아리 / ClubId / JoinCodeId / 정원 / 만료(KST) / 발급자 UserId. 코드 값 없음.
- 재생성 버스트 신호는 이번에 없다(Out of Scope).

### 2.6 Slack — 동아리명 보강 (BE)

- `OpsSlackListener` 가 `ClubRepository` 를 주입받아 `clubId → clubName` 을 조회하고, 포매터의 `feeAccountCreated`·`facilityBooking*` 4종에 `clubName`(nullable) 인자를 넘긴다. 포매터는 여전히 인자만 조립한다(자유 텍스트 미노출 원칙 유지 — 동아리명은 이미 `clubCreated` 등에 실리는 필드).
- 조회는 리스너의 @Async 스레드에서 `findById` 1회(Spring Data 자체 readOnly 트랜잭션). soft-delete 된 동아리는 `@SQLRestriction` 으로 빈 결과 → `clubName == null` → `compose` 의 null 필터로 줄이 빠진다(현재와 동일한 출력). 조회 실패는 `notify` 의 try/catch 로 흡수된다.
- 시설·회비 이벤트 record 는 바꾸지 않는다(리스너 javadoc 의 "발행 지점·필드 불변" 유지, `FacilityBookingNotificationListener` 무영향).
- 시그니처 변경 영향: `OpsSlackListenerTest` 의 `new OpsSlackListener(formatter, slackNotifier)` 생성자 호출, `OpsSlackMessageFormatterTest` 의 해당 5메서드 호출을 갱신한다.
- `ADMIN_USER_ACTION` 은 대상이 회원이라 동아리명이 없다 — 변경 없음.

## 3. 데이터 흐름 요약

```
총동연 상태 변경 ──► updateStatus ──► club_audit_event(CLUB_STATUS_CHANGED, reason, {from,to}) ──► Slack(기존)
총동연 폐쇄     ──► close        ──► club_audit_event(CLUB_CLOSED, reason)                    ──► Slack(기존)
운영진 초대 발급 ──► createClubInvite ──► club_audit_event(JOIN_LINK_CREATED|REGENERATED, detail{autoApprove,…})
                                     └─ autoApprove ──► ClubInviteAutoApproveIssuedEvent ──► Slack(신규)
총동연 열람     ──► GET /admin/clubs/{id}/activity-events ──► searchEvents(clubId, 허용 5종 ∩ types, 기간) ──► 화면
```

## 4. 오류·경계

- 감사 기록은 변이와 같은 트랜잭션 — CHECK 누락 시 변이째 실패한다. 2.1 의 전 타입 정합 테스트가 이를 막는다.
- Slack 발행은 AFTER_COMMIT 이라 롤백된 발급은 알림이 가지 않는다(기존 규약).
- `types` 에 허용 밖 값이 와도 400 이 아니라 무시한다 — 관리자 화면이 보내는 값은 고정이고, 개발자가 URL 로 찌를 때 회비 타입이 새어 나오지 않게 하는 것이 목적이다. enum 에 없는 문자열은 Spring 변환 실패로 기존 400 처리를 따른다.

## 5. 테스트

**BE**
- `ClubAuditEventTypesCheckTest`(기존 `ClubAuditEventFeeTypesTest` 를 전 타입으로 확장·개명): `ClubAuditEventType.values()` 전부 `feeAccount` 팩토리로 INSERT 성공, 건수 = `values().length`.
- `GeneralClubService.updateStatus` 통합: PENDING_APPROVAL→REJECTED(사유 있음) 뒤 REJECTED→PENDING_APPROVAL(전이표상 유일한 복귀 경로) 하면 행 2건, 첫 행 `reason` 보존(엔티티의 `rejectionReason` 은 null 로 지워져도)·detail from/to 정확.
- `GeneralClubClosureService.close` 통합: 폐쇄 뒤 `CLUB_CLOSED` 1건, `reason` = 정규화된 폐쇄 사유, `club_id` = 폐쇄된 동아리 id.
- `GeneralJoinCodeService.createClubInvite`: detail JSON 키 4종·값, 재생성 시 REVOKED(detail null) + REGENERATED(detail 있음) 2건. autoApprove true 면 `ClubInviteAutoApproveIssuedEvent` 1회 발행, false 면 0회(`ApplicationEvents` 또는 기존 Slack 통합 테스트 방식).
- `AdminClubActivityController` 슬라이스/통합: STUDENT 403, ADMIN 200, `types=FEE_POLICY_CREATED` 만 주면 허용 5종 전체 반환(회비 행 미포함), 최신순, `actorName` 조인, 폐쇄 동아리 id 로도 200.
- `OpsSlackMessageFormatterTest`: 자동승인 초대 메시지 필드·코드 미포함·만료 KST 분 단위, `feeAccountCreated`/`facilityBooking*` 에 동아리명 줄 추가 및 null 이면 생략. 기존 8건 중 시그니처가 바뀐 호출 갱신.
- `OpsSlackListenerTest`: 생성자 갱신. 동아리명 조회가 예외를 던져도 전송 시도가 예외를 전파하지 않는다.
- 회비 콘솔·이상징후 기존 테스트: `searchEvents` 개명 반영만.

**FE**
- 라벨·요약 유닛 테스트(`apps/web/test/admin/club-activity-labels.test.ts`): 5 타입 × 링크 종류 라벨, detail null → 요약 없음, autoApprove true/false 문구, 상태 from→to 라벨.
- API 클라이언트 테스트(`packages/api/test/adminClubActivity.test.ts`): `types` 배열이 같은 키 반복으로 직렬화되고 경로가 `admin/clubs/{id}/activity-events` 인지.
- 훅 테스트(`packages/hooks/test/adminClubActivity.test.tsx`): 쿼리키·파라미터 전달.
- 태스크마다 `pnpm test` + `typecheck` + `lint` 셋 다(FE GREEN 규칙).

## 6. PR 분리

`develop` 기준 스택 2개. 1개 단위 = 1 PR 원칙.

1. **BE** `feat(backend): 동아리 활동 이력 — 상태 전이 감사 기록(V127)·초대 detail·관리자 조회 API·자동승인 초대 Slack·Slack 동아리명 보강` — 2.1·2.2·2.3·2.5·2.6. 배포만으로 이력이 쌓이기 시작하고 화면은 없어도 무해.
2. **FE** `feat(frontend): 관리자 동아리 활동 이력 페이지 — 상태·가입 링크·부원 초대 로그` — 2.4. base = PR 1 브랜치(스택), PR 1 머지 뒤 base 를 develop 으로 전환.

## 7. Out of Scope

- **전 동아리 통합 타임라인**(`/admin/audit`) — 동아리 격리 가드(`requireNonNull(clubId)`) 해제와 `created_at` 단독 인덱스가 필요. 같은 API 에 `clubId` 를 선택값으로 바꾸는 후속으로 남긴다.
- **가입 요청 3종(JOIN_REQUEST_*) 화면 노출** — 요구 5. 필요해지면 학생 이름을 가리고 건수만 보이는 형태로 별도 검토.
- **링크 재생성 버스트 Slack 신호**(24h 내 3회 등) — 사용자 결정으로 제외. `countEventsSince` 가 있어 1 쿼리로 붙일 수 있다.
- **인앱(Notification) ADMIN 알림** — Slack 으로 대체 결정.
- **초대 전용 필터 칩** — 서버가 `types` 를 받으므로 `recruitmentId` null 여부 술어만 추가하면 된다.
- **기간 필터(화면·서버 `from/to`)** — 리포지토리 술어는 이미 기간을 받는다. 붙일 때 `AdminFeePeriod` 재사용은 `clubaudit → fee` 역의존이라 피하고, `TimeMapper.seoulToSystemWallClock` 환산을 clubaudit 안에 둔다.
- **과거 초대 발급 행의 detail 백필**, `JOIN_LINK_REVOKED`·모집 링크 이벤트에 detail 추가.
- **동아리 상태의 `rejectionReason` 덮어쓰기 동작 변경** — 최신값 컬럼은 그대로 두고, 이력은 감사 테이블이 맡는다.
- **동아리 운영진(manage) 화면에서의 자기 동아리 이력 열람** — 1차 사용자 결정(총동연·개발자)에 따라 제외.
- **시설·회비 이벤트 record 에 clubName 필드 추가** — 리스너 조회로 대체.
- **`FEE_ADMIN_*` 식 열람 감사** — 개인정보 없는 로그라 남기지 않는다.
- 모바일 앱·학생 공개 화면·운영진 화면 영향 없음.
