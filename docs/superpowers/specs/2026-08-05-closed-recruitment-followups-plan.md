# 마감 모집 후속 4-PR 계획 (#869 → #895 → #896 → #897)

> 작성 2026-08-05. **이 문서는 새 세션에서 단독으로 읽고 착수할 수 있게 쓴다** — 앞선 대화 맥락 없이도 진행 가능해야 한다.

---

## 0. 지금까지 배포된 것 (전제)

이 계획의 앞 단계는 모두 끝났다. 아래를 **이미 참인 사실**로 놓고 시작한다.

| 릴리스 | 내용 |
|---|---|
| #886 (V97~V104) | 가입 코드 회원 초대, 지원 FSM 단순화(서류심사 제거·ON_HOLD 도입), 마감 모집 **전면 조회 전용**, 관리자 모집 관리 콘솔 |
| #899 (마이그레이션 0건) | 마감 모집 **최종 결과 확정 허용**(#892), 학생 지원현황 마감 반영(#890/#891), 마감 다이얼로그 사전 경고(#889), 모집 과거 종료일 차단(#887), 만료-OPEN 운영진 표면 복구(#898) |

### 이번 후속에서 반드시 지켜야 할 두 가지 불변식

**(1) 마감 모집 정책 — `ClosedRecruitmentPolicy` 가 단일 출처**
마감(raw `status === CLOSED`) 모집은 **미결 지원서의 최종 결과 확정만** 허용한다. 보류·면접 대상 선정은 막고, 합격·불합격은 연다. 면접 쓰기(라운드 수정·발송·리마인드·슬롯·배정·확정)는 409 로 막되 **라운드 취소는 허용**한다 — 취소는 새 활동이 아니라 정리 행위이고, 막으면 자동 마감으로 남은 라운드를 아무도 치울 수 없다. `InterviewRoundAccessor` Javadoc 에 "일관성 정리로 쓰기 가드로 바꾸면 교착이 재발한다"는 경고가 명시돼 있으니 지우지 말 것.

**(2) 액션 축 / 표기 축 분리 (#898)**
- **액션 게이트 — 관객에 따라 축이 다르다**
  - 운영진·총동연(마감·수정·삭제 버튼, 대시보드 활성 판정, 목록 그룹) → raw `status`
  - **학생(지원 버튼·지원 링크) → `displayStatus`** — 백엔드는 만료-OPEN 을 여전히 OPEN 으로 받으므로
    프런트가 유일한 방어선이다. `useClubApply.canApply` 와 캘린더 지원 링크를 '일관성 정리'로 raw 로
    바꾸면 기간이 끝난 모집에 학생 지원이 다시 열린다. 바꾸지 말 것.
- **표기**(상태 칩, D-day, 캠페인 기간) → `displayStatus`
- 만료-OPEN(raw `OPEN` + `displayStatus CLOSED`) 판정은 `app/_lib/recruitmentDisplay.ts` 의 `isRecruitmentExpiredOpen` 하나만 쓴다. **세 번째 술어를 만들지 말 것.**

관련 스펙: [`2026-08-04-applicants-archive-closed-readonly-design.md`](./2026-08-04-applicants-archive-closed-readonly-design.md) (§1-3 이 2026-08-05 개정판)

---

## 1. 진행 순서와 근거

| 순서 | 이슈 | 성격 | 왜 이 순서인가 |
|---|---|---|---|
| 1 | **#869** (+#870 흡수) | 백엔드 5xx | 유일하게 **학생이 서버 에러 페이지를 본다**. 이미 배포된 링크는 회수 불가라 동아리 폐쇄 시점부터 계속 터진다 |
| 2 | **#895** | 학생 표면 정합 | #899 가 정리한 학생 경험의 **마지막 구멍**. 캘린더에서 지원을 누르면 에러 화면 |
| 3 | **#896** (+#880 검토) | 총동연 계약 결손 | 사용자 수는 적지만 **잘못된 근거로 강제 마감하면 되돌릴 수 없다** |
| 4 | **#897** (+#881 검토) | 위생 소묶음 | 개별 영향이 작아 마지막. 한 PR 로 묶음 |

각 PR 은 `develop` 에서 분기해 `develop` 으로 낸다. **스택하지 않는다** — 서로 다른 파일을 건드리므로 독립 머지가 가능하고, 스택은 squash 머지 후 재구성 비용만 생긴다.

---

## 2. PR-1 — #869 폐쇄 동아리 가입 링크 5xx (+ #870 문구)

### 문제

동아리 폐쇄(`GeneralClubClosureService`)는 모집을 일괄 마감(`closed_at` 스탬프)하고 soft-delete 하지만 **활성 가입 링크를 폐기하지 않는다.**

학생이 그 링크(`/join/{code}`)로 진입 → 사용 판정(`ClubJoinCode.isUsable`)이 soft-delete 된 recruitment LAZY 프록시를 초기화 → `@SQLRestriction` 에 걸려 `EntityNotFoundException` → **글로벌 핸들러 미등록이라 5xx**.

"유효하지 않은 가입 링크입니다" 안내가 나와야 할 자리에 서버 에러가 난다. 가입 자체는 어차피 불가(fail-closed)라 **보안 문제는 아니고 오류 표면만 잘못됐다.** v1(#848~#854)부터 있던 시나리오이며 개편 스택의 회귀가 아니다.

### 수정

폐쇄 트랜잭션에 **모집 삭제 경로와 동일한 패턴**으로 `revokeActiveByRecruitmentId` 호출 추가. `revoked_by` 는 폐쇄를 수행한 관리자.

먼저 기존 모집 삭제 경로의 폐기 호출을 읽고 그 형태를 그대로 따를 것 — 새 패턴을 만들지 않는다.

### 함께 처리 (#870)

같은 도메인·같은 파일군이라 흡수한다. **사용자 대면 문자열만** 교체하고 내부 네이밍(`joinCode` 클래스·경로·컬럼)은 그대로 둔다.

- `JoinRequestException` "사용할 수 없는 가입 **코드**입니다." → "가입 **링크**"
- `JoinCodeException` "유효하지 않은 가입 코드입니다." / "다른 운영진이 먼저 가입 코드를…"
- Swagger `@Tag` "가입 코드" 및 조회/폐기 summary

FE 는 이미 "가입 링크"로 통일돼 있고, 학생 랜딩 토스트가 **서버 문구를 그대로 노출**하는 경로가 있어 사용자에게 보인다.

### 테스트

- 폐쇄된 동아리의 링크 랜딩이 "유효하지 않은 가입 링크입니다"로 떨어지는 통합 테스트 1건 (**5xx 가 아님을 단언**)
- 문구 치환에 걸리는 기존 단언 갱신

### 검증

`cd backend && ./gradlew test` — **동시에 두 개 이상 실행하지 말 것** (Gradle 병렬 실행이 거짓 FAILURE 를 낸 전례). TestContainers 사용이므로 Docker 필요.

---

## 3. PR-2 — #895 학생 표면 마감 정합

두 문제가 **원인이 다르다**. 하나는 필터 누락, 하나는 두 쿼리의 기준 불일치다. 한 PR 로 묶되 커밋은 나눈다.

### 문제 1 — 공개 캘린더가 마감 모집을 살아있는 지원 링크로 노출

- BE `RecruitmentRepositoryImpl.findOverlappingPeriod` 가 날짜 범위 + 동아리 ACTIVE 만 보고 **모집 status 를 필터하지 않는다**
- FE `app/calendar/_lib/calendarMappers.ts` 도 `status`/`displayStatus` 를 보지 않는다 (**둘 다 응답에 이미 있다**)
- 상세 모달이 `/apply/{sourceId}` 로 보낸다

강제 마감돼 종료일이 아직 미래인 모집이 캘린더에 남고, 학생이 지원을 누르면 에러 화면을 본다. **다른 탐색 표면은 `displayStatus` 로 이 케이스를 막는데 캘린더만 뚫려 있다.**

#### 결정 필요 — 추천안: FE 매퍼에서 **지원 링크만** 죽인다

세 갈래가 있다.

| 안 | 내용 | 평가 |
|---|---|---|
| (a) BE 쿼리에 status 필터 | 마감 모집이 캘린더에서 **사라짐** | ❌ 캘린더의 의미가 "모집 일정 달력"이라 마감된 일정도 보이는 게 맞다. 지난 일정이 통째로 사라지면 달력이 아니다 |
| **(b) FE 매퍼에서 지원 링크만 제거** | 이벤트는 남고 모달의 지원 버튼이 마감 표기로 바뀜 | ✅ **추천.** 응답에 이미 `status`/`displayStatus` 가 있어 BE 변경 0. 다른 탐색 표면과 동일한 판정 기준 |
| (c) BE 응답에 필드 추가 | — | ❌ 불필요. 필드가 이미 온다 |

(b) 로 가되 **판정은 `displayStatus`** 를 쓴다(표기 축). 캘린더는 학생용 표시 화면이므로 "기간이 끝났으면 지원 못 함"이 맞다. 만료-OPEN 도 여기선 지원을 막는 게 옳다 — 운영진 콘솔과 축이 다르다.

**진행 전 사용자 확인 필요**: 마감 이벤트를 회색 처리할지, 아니면 그대로 두고 모달에서만 막을지.

### 문제 2 — 클럽 목록 "모집마감" ↔ 상세 "현재 모집 없음"

- 목록: `findRepresentativeByClubIds` 가 priority 1 폴백으로 CLOSED 를 대표 모집에 포함 → 카드에 "모집마감" 칩
- 상세: `findActiveByClubId` 는 OPEN + 미경과만 → `activeRecruitment = null` → "현재 진행 중인 모집이 없습니다"

같은 동아리가 목록에선 마감, 상세에선 모집 없음으로 보인다. **마감 모집은 흔해서 도달 빈도가 높다.**

부작용으로 **상세의 CLOSED 분기 전체가 도달 불가 죽은 코드**다:
`ClubDetailApplyBar.tsx:38`, `ClubRecruitmentCard.tsx:31/39`, `ClubRecruitmentSummary.tsx:35`.
테스트가 그 죽은 분기를 검증 중이다(`test/clubs/club-detail-apply-bar.test.tsx:106`) — 정리 시 함께 판단할 것.

#### 결정 필요 — 추천안: 상세가 마감 모집도 받게 한다 (죽은 코드를 살린다)

| 안 | 내용 | 평가 |
|---|---|---|
| (a) 목록에서 CLOSED 폴백 제거 | 카드에 아무 칩도 안 뜸 | ❌ 정보가 줄어든다. "이 동아리는 최근에 모집했었다"는 유용한 신호 |
| **(b) 상세도 마감 모집을 받는다** | CLOSED 분기가 실제로 렌더됨 | ✅ **추천.** 이미 그 분기의 UI 와 테스트가 존재한다 — 원래 의도가 이쪽이었고 쿼리만 안 맞았다는 뜻 |

(b) 는 상세 쿼리를 목록의 대표 모집 선정과 **같은 우선순위 규칙**으로 맞추는 작업이다. 두 쿼리가 같은 규칙을 두 번 구현하지 않도록 주의.

⚠️ **회귀 위험**: 상세가 마감 모집을 받으면 지원 버튼이 열리면 안 된다. CLOSED 분기가 지원을 막는지 **실제로 렌더해서** 확인할 것. 죽어 있던 코드라 한 번도 실행된 적이 없다.

### 테스트

- 캘린더: 마감 모집 이벤트가 렌더되되 지원 링크가 없음
- 목록↔상세: 같은 동아리에 대해 두 화면 표기가 일치
- CLOSED 분기가 실제로 도달되는지 (죽은 코드 부활 확인)

---

## 4. PR-3 — #896 총동연 강제 마감 판단 근거

### 문제 1 — 콘솔이 raw status 만 받는다

`AdminRecruitmentSummaryResponse`·`AdminRecruitmentDetailResponse` 에 **`displayStatus`·`closedAt` 이 없다**. 공개 응답(`RecruitmentSummaryResponse`·`RecruitmentDetailResponse`)에는 셋 다 있다.

FE 는 `RECRUITMENT_STATUS_LABEL[recruitment.status]` 로 raw 를 그대로 표기한다 (`AdminRecruitmentsTable.tsx:92,95`, `AdminRecruitmentDetailPage.tsx:99,102`).

결과:
- 같은 모집 1건이 **총동연 "모집중" / 학생 "모집마감" / 운영진 "마감"** 으로 세 화면 세 답
- **강제 마감 대상을 고르는 화면인데 판단 근거가 실제와 다르다**
- 강제 마감의 주체인데 **언제 마감됐는지 조회할 수 없다**

징후: FE 가 `needsOperatorAttention()`(`app/admin/recruitments/_lib/recruitmentLabels.ts:73`)에서 endDate 로 직접 재계산해 '운영 개입 필요' 필을 붙인다. **서버가 이미 계산해 둔 `displayStatus` 를 프런트가 재구현**하는 것으로, 계약 결손의 신호다.

> #898 에서 `recruitmentDisplay.ts:34-38` 과 `recruitmentLabels.ts` 양쪽에 상호 참조 주석을 남겨뒀다 — "AdminRecruitmentSummary 에 displayStatus 가 없어 endDate 로 직접 계산하므로 클라이언트 시계가 어긋나면 두 화면 판정이 갈릴 수 있다(#896 에서 통합)". **이 PR 이 그 통합이다.** 완료 후 양쪽 주석을 정리할 것.

### 수정 1

- Admin 응답 2종에 `displayStatus`·`closedAt` 추가 (공개 응답과 동일한 파생 방식 재사용 — 새로 계산하지 말 것)
- FE 표기를 `displayStatus` 로 전환
- `needsOperatorAttention` 의 endDate 재계산 제거 → `isRecruitmentExpiredOpen` 으로 통합 (술어 2개 → 1개)
- 상세에 마감 시각 표시

⚠️ **fail-open 규칙**: 새 필드가 없는 응답(구 BE)에서 화면이 깨지지 않아야 한다. "알려진 값만 분기"하고 `!== 'OPEN'` 같은 부정 분기를 쓰지 말 것 — 배포 전환기에 전면 버튼이 사라진 전례가 있다.

### 문제 2 — 동아리 운영 중단 안내가 결과를 반대로 말한다

`app/admin/clubs/_lib/clubStatus.ts:67`:
> "학생 탐색 페이지에서 동아리가 즉시 숨겨집니다. 기존 멤버십·지원 이력은 그대로 유지됩니다."

실제로는 `GeneralClubService:217-220` 이 `closeAllOnClubDeactivation` 으로 **OPEN 모집을 일괄 마감**한다. **마감은 되돌릴 수 없는데 안내엔 언급이 없고**, 재활성 문구(`:75`)는 가역적인 것처럼 암시한다. 이 경로는 동아리 폐쇄와 달리 미결 지원 정리도 하지 않는다.

빈도는 낮지만 **되돌릴 수 없는 결과를 안내가 반대로 설명**하는 형태다.

### 수정 2

- 운영 중단 확인 문구에 "진행 중인 모집이 모두 마감되며 되돌릴 수 없다" 명시
- 재활성 문구에서 모집 복구 암시 제거
- (#889 의 마감 다이얼로그가 미결 건수를 보여주는 패턴을 참고 — 같은 톤으로)

### 함께 처리 검토 (#880)

관리자 지원자 목록이 미존재·삭제 모집에 **빈 200**을 반환한다. 상세는 같은 경우 404 라 계약이 비대칭이다. `existsById` 1줄 + 정책 테스트 3건(미존재 404 / 삭제 404 / **EXTERNAL 은 여전히 빈 200**).

실사용 경로에서는 도달하지 않는다(프런트가 상세 성공 후에만 마운트). 같은 콘솔이라 묶되, **PR 이 커지면 분리**할 것.

---

## 5. PR-4 — #897 위생 소묶음

각 항목 1~2줄. 한 PR 로 묶는다. **체크박스를 하나씩 지우며 진행**하고, 하나라도 1~2줄을 넘으면 별도 이슈로 분리한다.

- [ ] **면접 관리 화면 CLOSED 게이트** — `manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/` 하위에 `recruitment.status` 를 보는 파일이 **0개**다. BE 는 라운드 수정·발송·리마인드·슬롯·배정·확정을 409 로 막는데 FE 는 버튼을 그대로 노출한다. 에러 메시지는 정확히 뜨므로(`RoundDashboard.tsx` 가 `ApiError.message` 인라인 표시) 차단은 아니지만 누를 수 없는 버튼을 보여줄 이유가 없다. ⚠️ **라운드 취소 버튼은 마감 후에도 살려둘 것** (§0 불변식 (1))
- [ ] **`InterviewCancelledListener` 데드코드** — `InterviewCancelledEvent` 발행처가 `backend/src` 전체에 0곳(유일한 발행은 테스트). 리스너 존치 여부 판단
- [ ] **ON_HOLD 학생 응답 노출** — `ApplicationStatus` 주석은 "지원자에게 SUBMITTED 와 동일 노출"이라 하지만 BE 가 강제하지 않아 `GET /users/me/applications` 원시 응답에 `"status":"ON_HOLD"` 가 그대로 실린다. **마스킹이 FE 단독이라 매핑이 한 번만 회귀해도 유출된다**
- [ ] **CLOSED 계약 3갈래 통일** — 지원 제출 400(code 없음) / 임시저장 410 / 철회·나머지 409 `RECRUITMENT_CLOSED`. #875 가 통일한 규약이 기존 학생 쓰기 2곳엔 미적용
- [ ] **마감 라벨 분기** — 이슈 본문은 "3중"이라 하지만 **#898 이후 위치가 바뀌었다.** 현재: `recruitmentDisplay.ts:13` '모집마감' / 같은 파일 `RECRUITMENT_DISPLAY_STATUS_LABEL.CLOSED` '마감' / `admin/…/recruitmentLabels.ts:15` '마감' / `ClubCard.tsx:43` '모집마감' / `ClubListItem.tsx:41,45` '마감' / `exploreParams.ts:87` '모집마감'. **`dashboard-labels.ts` 참조는 무효**(#898 에서 `recruitmentDisplay.ts` 로 이동). 전부 통일할지, 화면 성격상 다른 것은 남길지 판단할 것 — 무작정 합치면 운영 콘솔 칩 표기가 바뀐다
- [ ] **즐겨찾기 두 화면 표기 불일치** — `/me/favorites` 는 `openRecruitmentCount === 0` 일 때 배지 없음, `/me` 는 같은 조건에서 '마감' 명시
- [ ] **홈 티커 링크 쿼리 파라미터 불일치** — `RecruitmentTicker.tsx:70` 이 `/clubs?recruitmentStatus=AVAILABLE` 로 보내는데 파서는 `search.get('recruitment')` 를 읽어 **필터가 적용되지 않는다**
- [ ] **마감된 상시모집 통계 차트 무한 성장** — `GeneralRecruitmentStatsService.java:63-65` 가 `endDate == null` 이면 `LocalDate.now(clock)` 을 종료로 삼아, 마감 후에도 0값 데이터포인트가 매일 늘어난다. `closedAt` 을 상한으로
- [ ] **`/me/applications/{id}` 딥링크 무음 실패** — 라우트에 id 검증·`notFound()` 가 없고 `ApplicationsPage` 가 `isError` 를 무시해, **타인·미존재 지원서의 403/404 가 삼켜지고 평범한 목록만 렌더**된다
- [ ] **지원 상세 모달 죽은 링크** — `ApplyDetailModal.tsx` 의 "동아리 소개 바로가기"가 `href="#"` (`detail.clubId` 를 갖고도 안 씀)

### 함께 처리 검토 (#881)

관리자 모집 콘솔 Minor 3건. 성격이 같은 위생 작업이라 묶어도 되지만, **#897 이 이미 10건이라 분리를 권한다.**

- 지원서 시트 에러 표시 정렬 — `AdminApplicationSheet` 가 `isError` 와 stale `detail` 을 독립 조건으로 렌더해 백그라운드 refetch 실패 시 에러 배너가 정상 본문 위에 중첩. 지원자 패널과 같은 `isError && !detail` 로
- 지원자 목록 검색 타임아웃 — `REQUEST_TIMEOUT_MS.search` 미지정 (목록 `list` 와 비대칭)
- 모집 목록 `keepPreviousData` 미적용 — 검색어 변경마다 테이블이 스켈레톤 플래시

---

## 6. Out of Scope

이번 4-PR 에서 **하지 않는다.** 건드리고 싶어지면 별도 이슈로 낼 것.

| 항목 | 이유 |
|---|---|
| **#888 상시모집 접수 중단 액션** | 새 기능(마감 없이 신규 지원만 차단). 후속 정리가 아니라 정책 추가라 별도 판단 필요 |
| **만료-OPEN 자동 마감 배치** | #898 은 운영진이 직접 마감하도록 넛지하는 방향을 택했다. 배치 도입은 "마감 시점을 시스템이 정한다"는 정책 전환이라 별도 논의 |
| **만료-OPEN 칩 색 (앰버 중복)** | `RECRUITMENT_EXPIRED_OPEN_BADGE` 가 `RECRUITMENT_DISPLAY_STATUS_BADGE.UPCOMING` 과 동일해 '예정'과 라벨로만 구분된다. **디자인 판단 필요** — 코드로 결정하지 말 것 |
| **상세 페이지 상태 칩을 `recruitmentStatusChip` 헬퍼로 통합** | 상세는 라벨 어휘(`모집예정`/`모집마감`)와 색 규칙이 운영 콘솔 칩(`예정`/`마감`)과 다르다. 통합하면 예정·상시·마감 표기가 바뀌므로 디자인 판단이 선행 |
| **`PastRecruitmentsTable` 배지 조회 정리** | #898 이후 입력이 raw CLOSED 로 필터돼 사실상 상수다. 무해하므로 인접 정리 후보로만 |
| **타임존 정규화 2단계** | 별도 트랙 (`TIMEZONE.md` 참조) |
| **마감 모집 정책 재논의** | §0 불변식 (1). 근거는 아카이브 스펙 §1-3 에 기록됨 — **재논의하지 말 것** |

---

## 7. 착수 체크리스트 (새 세션용)

1. `git checkout develop && git pull` — #899 릴리스 머지 이후 상태인지 확인
2. **이 문서 §0 의 불변식 두 개를 먼저 읽는다.** 특히 라운드 취소 허용과 액션/표기 축 분리
3. 관련 스펙 [`2026-08-04-applicants-archive-closed-readonly-design.md`](./2026-08-04-applicants-archive-closed-readonly-design.md) §1-3 (2026-08-05 개정판)
4. PR-1(#869)부터 순서대로. 브랜치는 `fix/869-…` 형태로 `develop` 에서 분기
5. **결정 필요 지점에서 임의로 결정하지 말 것** — §3 에 두 곳 표시(캘린더 마감 이벤트 처리, 목록↔상세 기준 통일 방향). 추천안을 제시하고 사용자 판단을 받는다
6. 각 PR 은 구현 후 **리뷰 서브에이전트 2종**(머지 가부 + 코드 품질)을 디스패치하고 반영한 뒤 PR 을 올린다. 리뷰어에 haiku·sonnet 금지
7. 커밋·PR 제목은 Conventional Commits + 한국어, `대상 — 변경점` 명사구. PR 본문은 🚀/🤔/💬 3단, 파일·클래스명 나열 금지
8. **PR 생성까지만.** 머지는 사용자 지시 후

### 빌드·테스트 명령 (cwd 주의)

```bash
cd backend  && ./gradlew test          # 한 번에 하나만 — 병렬 실행이 거짓 FAILURE 를 낸다
cd frontend && pnpm --filter @duing/web typecheck
cd frontend && pnpm --filter @duing/web lint
cd frontend && pnpm --filter @duing/web test --run
cd frontend && pnpm --filter @duing/hooks test
```

`| tail` 로 파이프하면 exit code 가 가려진다 — 출력에서 `BUILD SUCCESSFUL` 을 직접 확인할 것.
