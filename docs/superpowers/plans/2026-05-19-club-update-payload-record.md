# `Club.UpdatePayload` record 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Club.update()` 의 19-arg 시그니처를 단일 `Club.UpdatePayload` record 로 래핑해 호출처 가독성을 회복하고 향후 필드 추가 시 호출처 깨짐을 방지한다.

**Architecture:** (1) `Club.java` 에 `UpdatePayload` nested record (19 평탄 필드) 추가, (2) `Club.update(...)` 19-arg → `Club.update(UpdatePayload payload)` 1-arg 로 시그니처 교체, (3) `UpdateClubCommand.toPayload()` 매핑 메서드 추가, (4) `GeneralClubService.update` 와 `ClubUpdateTest.java` 3 호출처를 새 시그니처로 보정. 순수 백엔드 내부 리팩토링이라 동작 동일, 외부 계약 무변경.

**Tech Stack:** Spring Boot 3.4, Java 21 record, JPA.

**Spec:** `docs/superpowers/specs/2026-05-19-club-update-payload-record-design.md`

**Branch:** `feat/club-update-payload-record` (already created)

---

## File Structure

**Modify:**
- `backend/src/main/java/com/duing/domain/club/entity/Club.java` — nested `UpdatePayload` record 추가 + `update(...)` 시그니처 1-arg 로 교체
- `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java` — `toPayload()` 메서드 추가
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` — `club.update(...)` 호출 1 라인으로 축소
- `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java` — 3 곳의 `club.update(...)` 19-arg 호출을 `Club.UpdatePayload` 생성자 호출로 교체

**Out of Scope (Spec 의 Out of Scope 그대로):** `UpdateClubCommand` 21-arg 정리, `ClubUpdateServiceTest`/`ClubMetadataUpdateTest`/`ClubNarrativeUpdateTest` 의 `new UpdateClubCommand(...)` 21-arg 호출 builder/factory 화, 다른 도메인 동일 패턴 적용.

---

## Task 1: `Club.UpdatePayload` nested record + `update()` 시그니처 교체

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

### Step 1 — `update()` 위(class 마지막 메서드 직전)에 nested record 추가

기존 `public void update(...)` 메서드 (현재 라인 177~217) 바로 위에 nested record 를 추가한다.

```java
public static record UpdatePayload(
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Integer foundedYear,
        Integer cohortNumber,
        String location,
        String contactEmail,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String membershipFee,
        String tagline,
        List<String> highlights,
        String majorProjects
) {}
```

`List`, `Set`, `DayOfWeek`, `ClubCategory`, `ClubSnsLink`, `ClubFaq` 은 이미 `Club.java` 상단에 import 되어 있음 (`Club` 필드/메서드가 사용 중) — 추가 import 불필요.

### Step 2 — `update(...)` 19-arg 시그니처 → `update(UpdatePayload payload)` 1-arg 로 교체

기존 메서드 전체를 다음으로 교체:

```java
public void update(UpdatePayload payload) {
    if (payload.name() != null) this.name = payload.name();
    if (payload.category() != null) this.category = payload.category();
    if (payload.division() != null) this.division = payload.division();
    if (payload.description() != null) this.description = payload.description();
    if (payload.logoUrl() != null) this.logoUrl = payload.logoUrl();
    if (payload.coverUrl() != null) this.coverUrl = payload.coverUrl();
    if (payload.tags() != null) this.tags = payload.tags().stream().distinct().toArray(String[]::new);
    if (payload.snsLinks() != null) this.snsLinks = new ArrayList<>(payload.snsLinks());
    if (payload.faqs() != null) this.faqs = new ArrayList<>(payload.faqs());
    if (payload.foundedYear() != null) this.foundedYear = payload.foundedYear();
    if (payload.cohortNumber() != null) this.cohortNumber = payload.cohortNumber();
    if (payload.location() != null) this.location = payload.location();
    if (payload.contactEmail() != null) this.contactEmail = payload.contactEmail();
    if (payload.activityFrequency() != null) this.activityFrequency = payload.activityFrequency();
    if (payload.activeDays() != null) this.activeDays = toActiveDaysCsv(payload.activeDays());
    if (payload.membershipFee() != null) this.membershipFee = payload.membershipFee();
    if (payload.tagline() != null) this.tagline = payload.tagline();
    if (payload.highlights() != null) this.highlights = new ArrayList<>(payload.highlights());
    if (payload.majorProjects() != null) this.majorProjects = payload.majorProjects();
}
```

19 라인의 null-skip 로직과 defensive copy 패턴 (`new ArrayList<>(...)`, `tags.stream().distinct().toArray(...)`, `toActiveDaysCsv(...)`) 모두 그대로 유지하고 참조만 `payload.<accessor>()` 로 변경.

### Step 3 — 컴파일 확인 (호출처 일시적으로 깨짐)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -10
```
Expected: `GeneralClubService.java:114` 및 `ClubUpdateTest.java:16, 46, 59` 의 19-arg `club.update(...)` 호출에서 컴파일 에러. 다음 task 에서 보정.

> **이 시점에 commit 하지 않는다.** Task 2 와 묶어 한 commit 으로.

---

## Task 2: `UpdateClubCommand.toPayload()` + `GeneralClubService.update` 호출 교체 + 테스트 호출처 보정 (단일 commit)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Modify: `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java`

### Step 1 — `UpdateClubCommand.java` 에 `toPayload()` 추가 + `Club` import

record body (`)` 닫는 괄호 다음 `{ ... }`) 안에 메서드 추가. 현재 파일이 32 라인의 단순 record 이므로 body 가 없으면 `{}` 를 도입한다.

상단 import 영역에 다음을 추가 (`UpdateClubCommand.java` 가 아직 `Club` 을 import 하지 않을 경우):

```java
import com.duing.domain.club.entity.Club;
```

`public record UpdateClubCommand(...)` 의 닫는 `)` 다음을 다음과 같이 바꾼다:

```java
) {
    public Club.UpdatePayload toPayload() {
        return new Club.UpdatePayload(
                name(),
                category(),
                division(),
                description(),
                logoUrl(),
                coverUrl(),
                tags(),
                snsLinks(),
                faqs(),
                foundedYear(),
                cohortNumber(),
                location(),
                contactEmail(),
                activityFrequency(),
                activeDays(),
                membershipFee(),
                tagline(),
                highlights(),
                majorProjects()
        );
    }
}
```

> 인자 순서는 `Club.UpdatePayload` 의 19 필드 순서 (name → category → ... → majorProjects) 와 정확히 동일하다. `UpdateClubCommand` 의 record 컴포넌트 순서가 동일하므로 1:1 매핑.

### Step 2 — `GeneralClubService.java` 의 `club.update(...)` 19-arg 호출을 1-arg 로 교체

기존 호출 (현재 라인 114~134):

```java
club.update(
        newName,
        updateClubCommand.category(),
        ...
        updateClubCommand.majorProjects()
);
```

을 다음 두 라인으로 교체:

```java
Club.UpdatePayload payload = new Club.UpdatePayload(
        newName,
        updateClubCommand.category(),
        updateClubCommand.division(),
        updateClubCommand.description(),
        updateClubCommand.logoUrl(),
        updateClubCommand.coverUrl(),
        updateClubCommand.tags(),
        updateClubCommand.snsLinks(),
        updateClubCommand.faqs(),
        updateClubCommand.foundedYear(),
        updateClubCommand.cohortNumber(),
        updateClubCommand.location(),
        updateClubCommand.contactEmail(),
        updateClubCommand.activityFrequency(),
        updateClubCommand.activeDays(),
        updateClubCommand.membershipFee(),
        updateClubCommand.tagline(),
        updateClubCommand.highlights(),
        updateClubCommand.majorProjects()
);
club.update(payload);
```

> `toPayload()` 를 직접 호출하지 않는 이유: service 의 `newName` 변수 (중복 검사 통과 후 사용되는 정규화된 이름) 가 `command.name()` 과 동일한 참조지만, 추후 정규화 로직이 추가될 가능성을 보존하기 위해 service 측에서 `newName` 으로 명시적으로 payload 를 만든다. `toPayload()` 는 service 가 정규화를 거치지 않을 때 (예: 다른 서비스/유틸) 의 편의 메서드로 둔다.

### Step 3 — `ClubUpdateTest.java` 의 3 호출처 교체

**호출 1 (라인 16~28):**

```java
club.update(
        "두잉 NEW",
        null,
        null,
        null,
        null,
        "https://cover",
        List.of("코딩", "스터디"),
        List.of(new ClubSnsLink("INSTAGRAM", "https://insta")),
        List.of(new ClubFaq("Q1", "A1", 0)),
        null, null, null, null, null, null, null,
        null, null, null
);
```

→ 다음으로 교체:

```java
club.update(new Club.UpdatePayload(
        "두잉 NEW",
        null,
        null,
        null,
        null,
        "https://cover",
        List.of("코딩", "스터디"),
        List.of(new ClubSnsLink("INSTAGRAM", "https://insta")),
        List.of(new ClubFaq("Q1", "A1", 0)),
        null, null, null, null, null, null, null,
        null, null, null
));
```

**호출 2 (라인 46~49):**

```java
club.update(null, null, null, null, null, null,
        List.of("코딩", "스터디", "코딩"), null, null,
        null, null, null, null, null, null, null,
        null, null, null);
```

→ 다음으로 교체:

```java
club.update(new Club.UpdatePayload(
        null, null, null, null, null, null,
        List.of("코딩", "스터디", "코딩"), null, null,
        null, null, null, null, null, null, null,
        null, null, null
));
```

**호출 3 (라인 59~61):**

```java
club.update(null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null,
        null, null, null);
```

→ 다음으로 교체:

```java
club.update(new Club.UpdatePayload(
        null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null,
        null, null, null
));
```

### Step 4 — 컴파일

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -5
```
Expected: `BUILD SUCCESSFUL`.

### Step 5 — (가능 시) 테스트 회귀 검증

Docker 가용 시:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "ClubUpdateTest" --tests "ClubUpdateServiceTest" --tests "ClubMetadataUpdateTest" --tests "ClubNarrativeUpdateTest" 2>&1 | tail -10
```
Expected: 모든 테스트 PASS. 회귀 없음 (행위 동일).

Docker 미가용 시 CI 에서 최종 검증.

### Step 6 — EOF newline 확인

```bash
for f in backend/src/main/java/com/duing/domain/club/entity/Club.java \
         backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java \
         backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java \
         backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java; do
    test "$(tail -c 1 "$f" | xxd -p)" = "0a" || echo "MISSING newline: $f"
done
echo "EOF OK"
```
Expected: `EOF OK`.

### Step 7 — Commit (Task 1 + 2 묶음)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/Club.java \
        backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java \
        backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java
git commit -m "refactor(backend): Club.update를 UpdatePayload record 1-arg로 정리"
```

---

## Task 3: PR 직전 self-check + PR 생성

### Step 1 — 7항목 self-check

```bash
echo "=== 1. 컴파일/테스트 ==="
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -3

echo "=== 2. 변경 범위 ==="
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git diff --stat develop..HEAD

echo "=== 3. 다른 측면 영향 ==="
echo "- 외부 HTTP/응답 계약 무변경"
echo "- 프론트엔드 영향 0"
echo "- DB 마이그레이션 없음"

echo "=== 4. EOF newline ==="
for f in $(git diff --name-only develop..HEAD); do
  [ -f "$f" ] || continue
  case "$f" in
    *.java|*.tsx|*.ts|*.sql) test "$(tail -c 1 "$f" | xxd -p)" = "0a" || echo "MISSING newline: $f" ;;
  esac
done
echo "EOF check done"

echo "=== 5. 커밋 형식 ==="
git log --format="%s" develop..HEAD | grep -v "^\(feat\|fix\|chore\|refactor\|test\|docs\)" || echo "OK — all Conventional Commits"
```

모두 SUCCESS / OK 여야 함. 미흡 항목 있으면 처리 후 다시 검증.

### Step 2 — push + PR

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-update-payload-record
gh pr create --base develop --title "refactor(backend): Club.update를 UpdatePayload record 1-arg로 정리" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `Club.update()` 의 19-arg 시그니처를 `Club.UpdatePayload` nested record 1-arg 로 정리했습니다. 호출처에서 인자 순서를 잘못 맞춰도 컴파일이 통과되던 위험을 제거하고, 앞으로 필드가 추가될 때 호출처가 자연스럽게 안전해집니다.
- `UpdateClubCommand.toPayload()` 매핑 메서드를 추가해 Request → Command → Payload 3-tier 패턴을 일관되게 맞췄습니다.
- 동작은 동일합니다 (null-skip 부분 갱신 + tags 중복 제거 + 컬렉션 defensive copy 모두 그대로). 행위 회귀를 잡기 위한 기존 통합/단위 테스트가 그대로 회귀 검증을 수행합니다.

## 🤔 고민했던 내용
- `GeneralClubService` 가 service 안에서 정규화된 `newName` 을 쓰기 때문에 `command.toPayload()` 를 직접 호출하지 않고, service 가 명시적으로 payload 를 구성합니다. `toPayload()` 는 정규화가 필요 없는 다른 호출처를 위한 편의 메서드로 남겨뒀습니다.
- 카테고리별 sub-record (BasicInfo / MetaInfo / Narrative) 로 더 분할할지 검토했으나 도메인 경계가 더 분명해질 때까지 평탄 19 필드로 유지합니다.

## 🔍 Out of Scope
- `UpdateClubCommand` 자체의 21-arg 정리 (별도 spec)
- `ClubUpdateServiceTest`, `ClubMetadataUpdateTest`, `ClubNarrativeUpdateTest` 의 `new UpdateClubCommand(...)` 21-arg 호출 builder/factory 화 (별도 cleanup PR)
- 다른 도메인 (Recruitment 등) 동일 패턴 적용

## 💬 리뷰 중점사항
- `Club.UpdatePayload` 의 필드 순서가 기존 `update(...)` 인자 순서와 1:1 동일한지, `UpdateClubCommand.toPayload()` 매핑이 정확한지.
- `ClubUpdateTest` 의 3 호출처가 `new Club.UpdatePayload(...)` 로 깔끔히 옮겨졌고 기존 어서션 의미가 보존되는지.
EOF
)"
```

---

## Self-Review

- [x] **Spec coverage** — Spec 의 5개 설계 항목(UpdatePayload record / update 시그니처 / toPayload / service 호출 / 테스트 호출처) 모두 Task 1·2 에 포함. Out of Scope 도 그대로 유지.
- [x] **Placeholder scan** — TBD/TODO/유사 placeholders 없음. 모든 코드 블록 완결.
- [x] **Type consistency** — `Club.UpdatePayload` 의 19 필드 타입 / 순서 / 이름이 Task 1 (record 선언), Task 2 (toPayload + service + test 호출) 에서 동일 — `name:String, category:ClubCategory, division:String, description:String, logoUrl:String, coverUrl:String, tags:List<String>, snsLinks:List<ClubSnsLink>, faqs:List<ClubFaq>, foundedYear:Integer, cohortNumber:Integer, location:String, contactEmail:String, activityFrequency:Integer, activeDays:Set<DayOfWeek>, membershipFee:String, tagline:String, highlights:List<String>, majorProjects:String`.
- [x] **DRY / YAGNI** — sub-record 분할 / Command-Payload 통합 등 인접 작업은 Out of Scope.
- [x] **자주 커밋** — Task 1+2 1 commit (시그니처 변경은 원자적이어야 컴파일 잘림 방지) + PR 단계.
- [x] **PR 직전 self-check** — Task 3 의 5 항목 명시 (컴파일/범위/영향/EOF/커밋 형식).
