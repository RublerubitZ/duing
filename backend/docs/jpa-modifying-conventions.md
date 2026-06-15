# JPA / `@Modifying` / `JdbcTemplate.batchUpdate` 사용 컨벤션

작성일: 2026-06-08
적용 범위: `backend/src/main/java/com/duing/domain/**` 의 모든 영속화 코드

본 문서는 도메인 객체를 DB 에 반영하는 세 가지 경로 — **JPA ORM**, **`@Modifying` JPQL**, **`JdbcTemplate.batchUpdate`** — 의 분기 원칙을 정리한다. 구체적인 건수 기준 ("N건 이상이면 JDBC") 은 의도적으로 두지 않는다. 같은 N건이라도 도메인 특성에 따라 선택이 갈리기 때문이다.

세 경로의 선택은 **무엇이 더 빠른가** 보다 **무엇이 도메인 의도를 더 정확히 표현하는가** 가 우선이다. 성능 차이가 결정적인 경우에만 실제 SQL 로그와 측정 데이터를 근거로 변경한다.

---

## 1. JPA ORM (`save`, `saveAll`, dirty checking)

### 1.1 언제 쓰는가

다음 중 **하나라도** 해당하면 JPA 가 기본 선택이다.

- **도메인 로직이 영속화 흐름에 섞여 있다** — 엔티티 메서드가 상태 전이를 검증하고, 그 결과가 곧 DB 에 반영되어야 한다.
- **엔티티 라이프사이클이 의미를 가진다** — `BaseEntity` / `BaseTimeEntity` 상속, `@PrePersist`, `@PreUpdate`, `@PreRemove`, `@SQLDelete` 등의 콜백 / 인터셉터가 동작해야 한다.
- **연관관계의 cascade · orphanRemoval 이 의미를 가진다** — 부모 엔티티 저장으로 자식까지 함께 영속화되어야 하거나, 자식 컬렉션에서 제거된 엔티티가 자동 삭제되어야 한다.
- **저장 직후 같은 트랜잭션에서 결과 엔티티를 재사용한다** — 영속성 컨텍스트의 1차 캐시·동일성 보장이 후속 로직에 필요하다.
- **건별 트랜잭션 격리·부분 실패 처리** — 일부 row 가 실패해도 나머지를 진행해야 하는 흐름(예: `GeneralApplicationService.bulkUpdateStatus()` 의 self-proxy 패턴) 은 saveAll 한 방이 아니라 건별 save 가 맞다.

### 1.2 주의할 한계

- 모든 엔티티가 `@GeneratedValue(GenerationType.IDENTITY)` 를 쓰는 한, **Hibernate JDBC batch insert 는 사실상 동작하지 않는다** (`hibernate.jdbc.batch_size` 설정과 무관). `saveAll(N)` 은 SQL 왕복을 묶지 않고 N 번 개별 INSERT 를 낸다.
- 즉, "JPA 라서 batch 가 자동으로 효율화된다" 는 가정은 본 코드베이스에서 성립하지 않는다. 작은 N (한 자릿수, 두 자릿수 초반) 에선 무시 가능한 오버헤드지만, 대량 fanout 에선 결정적 차이가 된다.

---

## 2. `@Modifying` JPQL DELETE / UPDATE

### 2.1 언제 쓰는가

다음을 **모두** 만족하면 derived query 나 fetch-then-save 대신 `@Modifying` JPQL 을 쓴다.

- **단일 DELETE 또는 UPDATE 한 방으로 표현 가능한 단순 쿼리** — `WHERE` 절이 명시적 컬럼 비교로 충분하고, row 별 분기 로직이 없다.
- **엔티티 로딩이 도메인적으로 불필요** — 삭제·갱신 전에 엔티티 상태를 확인할 필요가 없다.
- **라이프사이클 콜백 / soft delete 인터셉터 / cascade 의 의미가 없다** — `@SQLDelete`, `@SQLRestriction`, `@PreRemove`, cascade 옵션이 엔티티에 없거나, 있어도 우회해도 무방한 경우에만.
- **같은 트랜잭션 안에 후속 조회가 영속성 컨텍스트에 의존하지 않는다** — 의존한다면 `@Modifying(clearAutomatically = true)` 로 1차 캐시 정리.

### 2.2 변환 전 체크리스트

derived `deleteBy...` / `findAll + forEach + setter` 패턴을 `@Modifying` 으로 바꾸기 전 반드시 확인:

| 항목 | 확인 |
|---|---|
| 엔티티에 `@SQLDelete` 가 있는가 | 있으면 그 SQL 의 의도(soft delete) 가 깨지지 않도록 JPQL `WHERE` 절을 동일하게 보강하거나, 변환을 포기한다 |
| 엔티티에 `@SQLRestriction` 이 있는가 | UPDATE 의 경우 명시적으로 같은 조건을 WHERE 에 포함시킨다 |
| `@PreRemove` / `@PreUpdate` 콜백을 쓰는가 | 우회하면 안 되는 콜백이면 변환 포기 |
| cascade / orphanRemoval 로 연관 엔티티가 함께 처리되는가 | 우회하면 안 되는 관계면 변환 포기 |
| 같은 트랜잭션의 후속 코드가 영속성 컨텍스트의 1차 캐시를 참조하는가 | 참조한다면 `clearAutomatically = true` 추가 |

### 2.3 적용 예시 (본 코드베이스)

- `ApplicationDraftRepository.deleteByUserIdAndRecruitmentId` / `deleteAllByRecruitmentId` (2026-06-08 전환).
- `NoticeTargetClubRepository.deleteAllByNoticeId` — 이미 `@Modifying` JPQL DELETE 로 작성됨.

---

## 3. `JdbcTemplate.batchUpdate` (또는 `NamedParameterJdbcTemplate.batchUpdate`)

### 3.1 언제 쓰는가

다음을 **모두** 만족하면 JPA 영속화를 우회하고 JdbcTemplate batch 로 간다.

- **대량 단순 INSERT / UPDATE / UPSERT** — 도메인 로직이 영속화 흐름에 끼어들지 않는 순수 적재 작업.
- **엔티티 라이프사이클·cascade·dirty checking 이 의미를 갖지 않는다** — 콜백이 동작하면 안 되거나 동작 안 해도 무방.
- **영속성 컨텍스트의 1차 캐시·동일성을 유지할 가치가 없다** — 저장 직후 같은 트랜잭션에서 해당 엔티티를 다시 메모리로 다룰 필요가 없다.
- **현재 JPA 경로가 SQL 왕복을 묶지 못한다** — IDENTITY 전략으로 인해 saveAll 이 N 번의 개별 INSERT 를 내고 있고, 그 N 이 사용자 경험·시스템 부하에 직접적인 영향을 준다.
- **부분 실패 정책이 batch 의미와 일치한다** — 한 건 실패가 batch 전체 롤백 또는 묶음 단위 처리로 충분하다 (건별 정밀 에러 메시지가 필요 없는 경우).

### 3.2 대표 사용 시나리오

- **대량 fanout** — 한 사건이 N 명에게 알림·이력 row 를 생성하는 경우 (예: 공지 발행 → 수신자 N 명).
- **통계성 적재** — 분석/집계 결과를 주기적으로 N 개 row 로 적재하는 경우.
- **대량 UPSERT** — 외부 데이터 소스의 N 건을 우리 테이블에 `ON CONFLICT DO UPDATE` / `DO NOTHING` 으로 동기화하는 경우. JPA 로는 표현하기 번거롭다.
- **마이그레이션·정기 잡** — 데이터 정합성 유지용 백그라운드 잡으로 N 건을 한꺼번에 처리.

### 3.3 도입 전 측정 의무

JdbcTemplate batch 로의 전환은 **반드시 측정 데이터를 근거로** 한다. 다음 중 최소 한 가지 이상을 보고서에 포함:

- 현재 JPA 경로의 실제 SQL 로그 (`logging.level.org.hibernate.SQL=debug` 로 확인) 와 round-trip 횟수
- `hibernate.jdbc.batch_size` 설정 상태와 엔티티 PK 전략(IDENTITY 면 batch insert 가 무력화됨)
- 사용자 경험 또는 시스템 부하에서의 실제 임팩트 (응답 지연, 메모리, 트랜잭션 점유 시간 등)
- 전환 후 예상 이득 (round-trip 절감, 영속성 컨텍스트 부하 감소 등)

"쿼리 수가 줄어든다" 만으로는 전환 근거가 부족하다.

### 3.4 도입 시 주의

- **UNIQUE / FK 제약과의 충돌 처리** — JdbcTemplate 은 도메인 예외로 자동 변환되지 않는다. `DuplicateKeyException` 등 Spring DataAccessException 계열을 catch 해 도메인 예외로 명시적 매핑.
- **트랜잭션 동기화** — JdbcTemplate 도 같은 트랜잭션의 DataSource 를 공유하므로 별도 처리 불필요하지만, **flush 시점이 JPA 와 다르다**. 같은 트랜잭션 안에서 JPA save 와 JdbcTemplate batch 를 섞을 때는 `EntityManager.flush()` 를 명시적으로 호출하여 순서를 강제한다.
- **IDENTITY 컬럼의 생성 ID 가 필요한 경우** — `KeyHolder` 또는 `RETURNING id` 절을 사용한다. 단순 적재가 아니라 ID 가 후속 로직에 필요하면 JPA 가 더 적합한 선택일 수 있다.

---

## 4. 결정 흐름

```
       작업 시작
           │
           ▼
   ┌────────────────────────────────────────┐
   │ 도메인 로직·라이프사이클·cascade 가     │
   │ 영속화 흐름에 의미를 갖는가?           │
   └────────────────────────────────────────┘
        │ Yes                  │ No
        ▼                      ▼
    [JPA ORM]          ┌─────────────────────────────┐
                       │ 단일 DELETE/UPDATE 한 방으로 │
                       │ 표현 가능한가?              │
                       └─────────────────────────────┘
                            │ Yes              │ No
                            ▼                  ▼
                    [`@Modifying` JPQL] ┌────────────────────────┐
                                        │ 대량 단순 적재이고      │
                                        │ 현재 SQL 왕복이 측정 가능 │
                                        │ 한 비용인가?            │
                                        └────────────────────────┘
                                              │ Yes        │ No
                                              ▼            ▼
                                  [JdbcTemplate.batchUpdate]  [JPA 유지]
```

---

## 5. 본 코드베이스 인벤토리 (2026-06-08 기준)

### 5.1 적용 완료

| 위치 | 패턴 | 비고 |
|---|---|---|
| `ApplicationDraftRepository.deleteByUserIdAndRecruitmentId` | `@Modifying` JPQL DELETE + `clearAutomatically=true` | 2026-06-08 전환 |
| `ApplicationDraftRepository.deleteAllByRecruitmentId` | `@Modifying` JPQL DELETE + `clearAutomatically=true` | 2026-06-08 전환 |
| `NoticeTargetClubRepository.deleteAllByNoticeId` | `@Modifying` JPQL DELETE | 기존부터 적용 |
| `GeneralApplicationService.bulkUpdateStatus()` | self-proxy + 건별 save | 의도된 건별 tx 격리. 유지 |
| `GeneralRecertificationRoundService` | `findAllById` + Map 인덱싱 | 의도된 N+1 회피. 유지 |

### 5.2 보류 (Dirty Checking 유지)

| 위치 | 결정 | 사유 |
|---|---|---|
| `GeneralClubPhotoService.reorder()` | 현재 dirty checking 유지 | 호출 빈도 낮음 + 동아리당 사진 수 적음 + 사용자 체감 효과 거의 없음 + `@SQLDelete`/`@SQLRestriction` 보조 조건 누락 시 silent 데이터 손상 위험. 유지보수성이 절감보다 우선 |

### 5.3 백로그 (즉시 진행 안 함, 사전 조건 충족 시 별도 PR)

| 위치 | 잠정 결정 | 진행 조건 |
|---|---|---|
| `GeneralNoticeBroadcaster.bulkInsertNotifications` (최대 2000건 fanout) | `JdbcTemplate.batchUpdate` 로 전환 타당성 인정 | (1) 운영 도입 직전 또는 실제 대량 발송 기능 활성화 시점 (2) 전환 PR 에 **전/후 SQL 수와 실행 시간 측정 결과 포함 필수** (3) `dedup_key` UNIQUE 충돌 흡수 전략 (`ON CONFLICT DO NOTHING`) 명시 |

### 5.4 변환하지 않는 케이스 / 일반 원칙

- soft delete (`@SQLDelete` / `@SQLRestriction`) 가 적용된 엔티티의 derived delete 는 그대로 두는 편이 안전하다 (`@SQLDelete` 의 의도가 자동으로 동작).
- 엔티티가 cascade 로 연관 엔티티를 함께 정리하는 경우 fetch-then-remove 가 도메인 의도와 일치한다.

---

## 6. 최적화 체크리스트

> **쿼리 수 감소만으로는 최적화를 승인하지 않는다.**

새 영속화 최적화를 제안하거나 기존 코드를 변경할 때, PR 본문에 다음 다섯 항목을 **모두** 명시한다. 한 항목이라도 비어 있으면 리뷰 보류 사유가 된다.

### 6.1 실제 SQL 패턴 확인
- 변경 전·후 발생하는 실제 SQL 쿼리를 로그(`logging.level.org.hibernate.SQL=debug`) 또는 명시적 예시로 첨부한다.
- "이런 쿼리가 나갈 것이다" 가 아니라 **실제로 확인된 쿼리**여야 한다.

### 6.2 엔티티 라이프사이클 영향 확인
- 대상 엔티티의 `@SQLDelete` / `@SQLRestriction` / `@PreRemove` / `@PrePersist` / `@PreUpdate` / cascade / orphanRemoval 옵션을 모두 점검한다.
- 변경이 이들 콜백·인터셉터를 우회하는가? 우회한다면 그 우회가 도메인 의도와 일치하는가?
- 같은 트랜잭션 안 후속 코드가 영속성 컨텍스트의 1차 캐시를 참조하는가? 참조한다면 `clearAutomatically = true` 또는 명시적 flush/clear 로 sync 를 보장한다.

### 6.3 유지보수 복잡도 증가 여부
- 표준 어노테이션·기본 동작에서 멀어진 만큼 코드를 읽는 동료가 이해하기 어려워졌는가?
- 새로 도입한 어노테이션·SQL·도메인 분기가 향후 디버깅·확장에 부담이 되지 않는가?
- 유지보수 복잡도 증가가 얻는 이득에 비례하지 않으면 보류 또는 거절한다.

### 6.4 예상 성능 이득 수치화
- round-trip 횟수, 메모리 사용량, 트랜잭션 점유 시간, 응답 latency 등 **숫자로** 표현한다.
- 막연한 "더 빠를 것이다" 는 근거로 인정하지 않는다.
- 사용자 체감·시스템 부하·운영 비용 중 어디에 어떻게 기여하는지 명시.

### 6.5 측정 결과 존재 여부
- 위 6.4 의 예상값을 뒷받침하는 **실제 측정 결과**를 첨부한다. 통합 테스트 + Hibernate Statistics, p95 latency 측정, 메모리 사용량 비교 등.
- 측정 환경(local / staging / prod-like)·데이터 규모를 명시한다.
- 측정이 불가능한 단계(운영 데이터 부재 등) 라면 그 사실 자체를 명시하고 의사결정 보류 사유로 둔다.

---

## 변경 이력

- 2026-06-08 — 최초 작성. DR2 (ApplicationDraft derived delete → `@Modifying`) 적용과 함께 컨벤션 정립. DR3 (ClubPhoto reorder) 는 보류, DR4 (Notification fanout) 는 백로그로 분리.
