# 멤버 원본 연락처 조회 — 설계

작성일 2026-07-25. 대상 브랜치 `feat/member-phone-reveal`.

## 배경

회원 관리 리디자인(#751)에서 상세 패널의 연락처 복사 버튼을 제거했다. 멤버 목록 API 가 마스킹된 번호(`010-****-5678`)만 내려주는데 버튼은 그 마스킹 값을 클립보드에 넣으면서 "복사됨" 이라고 성공을 알렸고, 사용자는 붙여넣기 전까지 쓸 수 없는 값을 받았다는 사실을 알 수 없었다.

운영진은 실제로 회원에게 연락할 일이 있다. 마스킹 기본 정책을 유지하면서, 회장이 명시적으로 조회한 경우에만 원본을 제공한다.

## 목표

- 목록·기본 표시는 계속 마스킹만 노출한다.
- 원본은 별도 API 로만, 회장이 명시적으로 요청했을 때만 내려간다.
- 원본 조회는 감사 기록을 남긴다.
- 복사는 원본을 받은 이후에만 가능하며, 마스킹 문자열은 어떤 경우에도 클립보드에 들어가지 않는다.

## Out of Scope

이번 작업에서 하지 않는 것을 명시한다.

- **Permission 기반 권한 재설계** — `CONTACT_VIEW` / `MEMBER_EXPORT` 같은 기능 권한을 역할과 분리해 부여하는 구조. 총무·부회장 등의 실제 수요가 확인되면 CSV 내보내기 정책과 함께 재설계한다.
- **전용 감사 테이블(P2)** — `personal_data_audit`(club_id, actor_user_id, target_user_id, resource_type, action, created_at, ip, user_agent). 개인정보 조회 기능이 확대되면 도입한다. `club_member_history` 와는 완전히 분리한다.
- **requestId · IP · User-Agent 기록** — 아래 "감사 기록" 참조. P2 테이블과 함께 넣는다.
- **목록 행·모바일 카드의 번호 보기 버튼** — 여러 명의 연락처가 필요한 운영은 CSV 내보내기로 해결한다.
- **타이머 기반 자동 재마스킹**
- **OFFICER 권한 확대**
- **`club_member_history` 재사용** — 이 테이블은 회원 생애주기 이벤트(가입·탈퇴·역할 변경·회장 이양) 전용으로 유지한다. 개인정보 조회는 목적이 다르고, 총동연 관리자 화면(`GET /admin/clubs/{clubId}/member-history`)에 그대로 노출되므로 조회 이벤트를 섞으면 생애주기 이력이 조회 기록에 묻힌다.

## 정책 결정

### 권한 — 회장(LEADER) 전용

민감 정보 접근이 이미 회장 중심으로 구성돼 있다. 연락처가 포함된 CSV 내보내기, 역할 변경, 강제 탈퇴가 모두 회장 전용이다. 원본 연락처 조회만 임원에게 열면 "CSV 는 못 받는데 개별 번호는 볼 수 있는" 어긋난 권한 체계가 된다.

| 역할 | 원본 조회 |
|---|---|
| LEADER | 허용 |
| OFFICER | 불가 (마스킹만) |
| MEMBER | 불가 |

### 감사 기록 — 구조화 로그 (P1)

구현 비용이 가장 낮고, 전화번호 **전체 명단**이 나가는 CSV 내보내기가 이미 같은 방식이라 일관된다. 무엇보다 조회 API 를 순수 읽기로 유지할 수 있다.

이 레포에는 조회 서비스의 클래스 레벨 `readOnly` 트랜잭션이 쓰기 오케스트레이션을 감싸 실제 PostgreSQL 에서 500 이 발생한 전례가 있다. 조회 API 안에서 직접 INSERT 하는 구조는 만들지 않는다. P2 에서 전용 테이블을 도입할 때도 조회 서비스와 감사 기록 저장을 분리해 별도 쓰기 트랜잭션에서 처리한다.

**requestId · IP · User-Agent 는 P1 에서 제외한다.** 이 레포에는 MDC·요청 ID 필터가 없어 requestId 는 새 인프라가 필요하고, 백엔드가 Caddy 뒤에 있어 IP 는 `X-Forwarded-For` 를 제대로 다뤄야 실제 클라이언트 주소가 나온다. 대충 넣으면 프록시 주소가 기록돼 감사 기록이 거짓이 된다. P2 테이블의 컬럼으로 함께 도입한다.

### 재마스킹 — 타이머 없음

원본이 다시 감춰지는 경우는 셋이다: 패널을 닫음 / 다른 회원을 선택 / 새로고침·화면 이탈. 30초·1분 자동 재마스킹은 넣지 않는다. 번호를 옮겨 적는 중에 사라지면 다시 눌러야 하고, 그때마다 감사 로그만 늘어난다. 보안 이득보다 사용성 손실이 크다.

### 노출 위치 — 상세 패널만

회원 한 명을 고른 뒤 그 사람에게 연락하는 운영 흐름과 맞는다. 목록 행에 두면 한 화면에서 명단 전체의 번호를 연달아 펼칠 수 있게 되어 최소 노출 원칙과 어긋나고, 감사 로그도 의미 단위를 잃는다.

## 백엔드 설계

### 엔드포인트

```
GET /clubs/{clubId}/members/{memberId}/phone
→ 200 { "ok": true, "data": { "phone": "010-1234-5678" }, "message": null }
```

`api/ClubMemberApi` 에 Swagger 인터페이스를 선언하고 `controller/ClubMemberController` 가 구현한다(레포 규칙: `api/` 인터페이스 없이 컨트롤러 단독 작성 금지).

응답 DTO 는 `MemberPhoneResponse(String phone)` record.

### 권한·에러

`clubAuthService.requireLeader(requesterId, clubId)` 를 그대로 사용한다. 이 게이트가 회장 검증과 비-ACTIVE 동아리 차단을 함께 수행하므로 별도 분기를 두지 않는다.

| 상황 | 응답 |
|---|---|
| 회장 | 200 |
| 임원·부원 | 403 |
| 비멤버 | 403 (`NotAMember`) |
| 비-ACTIVE 동아리 | 403 (`NotActiveClub`) |
| 다른 동아리의 memberId | 404 (`ClubMemberException.NotFound`) |
| 존재하지 않는 memberId | 404 (`ClubMemberException.NotFound`) |
| 미인증 | 401 |

### 서비스

`ClubMemberQueryService.getMemberPhone(Long clubId, Long memberId, Long requesterId): String` 를 추가한다. `GeneralClubMemberQueryService` 의 클래스 레벨 `@Transactional(readOnly = true)` 를 유지하며 DB 쓰기를 하지 않는다.

대상 조회는 `GeneralClubMemberCommandService.findMembershipInClub` 과 동일한 규칙을 따른다 — `findById` 후 소속 클럽이 다르면 `NotFound`(404). 두 서비스가 같은 규칙을 각자 갖게 되므로, 구현 시 한쪽으로 모으는 편이 나은지 판단한다(무리한 공유보다 중복이 나을 수 있어 구현자 재량으로 둔다).

반환값은 `User.phone` 원본 그대로다. 이 컬럼은 NOT NULL 이므로 정상 회원은 항상 값이 있다. 익명화된 계정(`anonymized_at`)은 치환된 값이 그대로 내려간다 — 별도 분기를 두지 않는다.

### 감사 로그

CSV 내보내기(`club member export: …`)와 같은 계층·같은 형식으로 남긴다.

```
member phone view: clubId={}, actorUserId={}, targetMemberId={}, targetUserId={}, action=PHONE_VIEW
```

시각은 로그 패턴이 이미 기록한다. **번호 값은 로그에 넣지 않는다** — 내보내기 로그도 같은 규칙이며 테스트로 고정돼 있다.

### 기존 API 무변경

`GET /clubs/{clubId}/members` 와 `…/members/export` 는 손대지 않는다. 목록 응답은 계속 `phoneMasked` 만 제공한다.

## 프론트 설계

### API·훅

`client.clubs.memberPhone(clubId, memberId): Promise<{ phone: string }>` 추가.

훅은 **쿼리가 아니라 뮤테이션**으로 만든다(`useMemberPhoneMutation(clubId)`). React Query 캐시에 원본을 담으면 패널을 닫았다 다시 열 때 캐시 히트로 번호가 감사 로그 없이 되살아나 재마스킹 정책과 어긋난다. 뮤테이션은 캐시를 남기지 않는다. CSV 내보내기가 GET 을 뮤테이션으로 감싸는 같은 전례가 있다.

### 컴포넌트

`MemberDetailPanel` 의 `ContactValue` 만 바뀐다. 회장 여부(`isLeaderViewer`)와 `memberId` 를 props 로 받는다.

상태 전이:

| 상태 | 표시 |
|---|---|
| 초기 (회장) | `010-****-5678` + **[번호 보기]** |
| 초기 (임원·부원) | `010-****-5678` (버튼 없음) |
| 조회 중 | 마스킹 유지 + 버튼 진행 표시 |
| 성공 | `010-1234-5678` + **[복사]** — **[번호 보기]는 사라진다** |
| 실패 | 마스킹 유지 + 에러 문구, 복사 버튼 없음, [번호 보기] 재시도 가능 |
| 번호 없음(`phoneMasked === null`) | `—` (버튼 없음) |

성공 후 [번호 보기]를 없애는 이유: 이미 원본이 떠 있는데 다시 누를 수 있으면 중복 조회와 불필요한 감사 로그가 생긴다.

복사는 조회로 받은 **원본만** 클립보드에 넣는다. 마스킹 문자열을 복사하는 경로는 코드에 존재하지 않는다.

### 노출 수명

노출 상태는 `ContactValue` 로컬 상태다. 상세 패널 본문은 회원 단위로 새로 마운트되므로(`PanelBody key={member.memberId}`) 회원을 바꾸면 자동 초기화된다. 패널을 닫으면 언마운트되고, 새로고침하면 당연히 사라진다. 별도 정리 코드가 필요 없다.

목록 표(`MemberTable`)와 모바일 카드는 변경하지 않는다.

## 테스트

### 백엔드 (통합)

- 회장이 조회하면 200 과 원본 번호가 내려온다.
- 임원·부원·비멤버는 403.
- 다른 동아리의 memberId 는 404.
- 비-ACTIVE 동아리에서는 회장도 차단된다.
- 감사 로그에 `action=PHONE_VIEW` 와 actor/target 이 남고, **번호 값은 남지 않는다**.
- 회귀: 멤버 목록 API 응답에 원본 번호가 없고 `phoneMasked` 만 있다.

### 프론트

- 회장에게만 [번호 보기]가 보인다(임원 뷰어는 마스킹만).
- 누르기 전에는 복사 버튼이 없다.
- 성공 시 원본이 표시되고 [번호 보기]는 사라지며, 복사 시 클립보드에 원본이 들어간다.
- 실패 시 마스킹이 유지되고 복사 버튼이 나타나지 않는다.
- 다른 회원으로 전환하면 노출이 초기화된다.
- `phoneMasked` 가 null 이면 `—` 만 표시되고 버튼이 없다.

## 후속

- P2: `personal_data_audit` 테이블 도입 시 조회 서비스와 분리된 쓰기 경로로 설계하고 IP·User-Agent·requestId 를 함께 기록한다.
- Permission 기반 권한 분리(`CONTACT_VIEW`, `MEMBER_EXPORT`)는 CSV 정책과 묶어 별도로 검토한다.
