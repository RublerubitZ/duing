# 동아리 태그 입력 안정화 + 검색에 태그 포함 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 정보 수정 폼의 한글 IME 중복 등록 버그를 막고 태그 최대 5개 정책을 UI 로 강제하며, `/clubs?keyword=` 검색이 태그 컬럼까지 포함하도록 백엔드 조건을 확장한다.

**Architecture:** 프론트는 `TagsInput` 의 `onKeyDown` 에 3중 IME 가드를 두고 `ClubInfoForm` 헤더에 `n/5` 카운터·overflow 경고 메시지를 추가한다. 백엔드는 Hibernate `array_to_string` 함수를 등록하고 `ClubRepositoryImpl.keywordContains` 에 정규화된 키워드 → name/description/tags ILIKE OR 조건을 합친다.

**Tech Stack:** Next.js 15 + React 19 (App Router, `'use client'`), Spring Boot 3.4 / Java 21, QueryDSL, Hibernate 6, Postgres `text[]`, TestContainers + JUnit5 + AssertJ.

**PR 분리:** `fix/frontend-tags-input-ime-and-limit` (Task 1-2 → 검증 → 커밋·PR), `feat/backend-clubs-keyword-tag-search` (Task 3-6 → 검증 → 커밋·PR). 두 브랜치는 모두 `develop` 에서 분기.

---

## File Structure

### Frontend (PR #1)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx`
  - 책임: 태그 칩 + 입력. IME composition state 추적, maxTags 기본 5.
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:329-334`
  - 책임: 태그 섹션 라벨/안내 영역. `n/5` 카운터, 5초과 경고 메시지 분기.

### Backend (PR #2)
- Modify: `backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java`
  - 책임: Hibernate function 등록. `array_to_string` STRING 반환 패턴 추가.
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java:155-159`
  - 책임: `keywordContains` 만 확장. 다른 메서드 미변경.
- Create: `backend/src/test/java/com/duing/domain/club/repository/ClubRepositoryImplKeywordSearchTest.java`
  - 책임: keyword OR (name|description|tags) 통합 검색 통합 테스트. TestContainers.

---

## Task 1: TagsInput IME 가드 + maxTags 기본값 5

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx`

- [ ] **Step 1: 기본값과 composition state 추가**

`TagsInput.tsx` 전체를 아래로 교체한다. 변경점은 (a) `maxTags = 20` → `maxTags = 5`, (b) `isComposing` state 도입, (c) `onCompositionStart/End` 핸들러, (d) keydown 가드, (e) onBlur 가드.

```tsx
'use client';

import { useState } from 'react';

type TagsInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxTags?: number;
};

export function TagsInput({ value, onChange, readOnly = false, maxTags = 5 }: TagsInputProps) {
  const [draft, setDraft] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  function add(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxTags) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-[42px] border border-[#cfcab8] bg-white rounded-[8px] px-2.5 py-2">
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1.5 bg-[#e7ebd9] text-[#3e5b34] border border-[#cfd6b3] rounded-full py-[3px] pl-[11px] pr-2.5 text-[12.5px] font-medium"
        >
          {tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label={`태그 ${tag} 삭제`}
              className="text-[#4a6b3f] text-[13px] leading-none opacity-70 hover:opacity-100 cursor-pointer"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!readOnly && value.length < maxTags && (
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (isComposing) return;
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => {
            if (isComposing) return;
            add(draft);
          }}
          placeholder={value.length === 0 ? '엔터로 태그 추가' : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] outline-none"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크/린트 통과 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck && pnpm --filter web lint
```
Expected: PASS (오류 없음). `event.keyCode` 가 deprecated 경고를 띄우면 그대로 두되, 에러로 승격되면 `// eslint-disable-next-line @typescript-eslint/no-deprecated` 한 줄을 키다운 핸들러 직전에 추가.

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git checkout -b fix/frontend-tags-input-ime-and-limit && \
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx && \
git -c commit.gpgsign=false commit -m "fix(frontend): TagsInput IME 가드 + maxTags 기본 5"
```

---

## Task 2: ClubInfoForm 태그 섹션 카운터/경고 UI

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:329-334`

- [ ] **Step 1: 태그 섹션 마크업 교체**

`ClubInfoForm.tsx` 의 329-334 라인 (태그 div 블록) 을 아래로 교체한다.

기존:
```tsx
<div className={fieldCls}>
  <span className={labelCls}>
    태그 <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 20개)</span>
  </span>
  <TagsInput value={tags} onChange={setTags} readOnly={readOnly} />
</div>
```

변경 후:
```tsx
<div className={fieldCls}>
  <div className="flex items-baseline justify-between">
    <span className={labelCls}>
      태그 <span className="text-[11.5px] font-normal text-[#8a8f83]">(최대 5개)</span>
    </span>
    <span
      className={`text-[11.5px] font-medium ${
        tags.length > 5
          ? 'text-[#b04a2a]'
          : tags.length === 5
            ? 'text-[#3e5b34]'
            : 'text-[#8a8f83]'
      }`}
    >
      {tags.length}/5
    </span>
  </div>
  <TagsInput value={tags} onChange={setTags} readOnly={readOnly} />
  {tags.length > 5 && (
    <p className="mt-1.5 text-[12px] text-[#b04a2a]">
      이전에 등록된 태그가 5개를 초과합니다. 새 태그를 추가하려면 먼저 일부를 삭제해 주세요.
    </p>
  )}
  {tags.length === 5 && (
    <p className="mt-1.5 text-[12px] text-[#8a8f83]">최대 5개까지 추가할 수 있어요.</p>
  )}
</div>
```

설계 메모: `TagsInput` 의 `maxTags` 는 prop 으로 전달하지 않는다 — 기본값 5 가 그대로 적용된다. 6개 이상인 기존 데이터일 때 `value.length < maxTags` 가 false 이므로 input 이 미노출되어 추가가 자동 차단된다.

- [ ] **Step 2: 타입체크/린트/빌드 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 3: 로컬 수동 검증 (브라우저)**

`pnpm --filter web dev` 로 띄우고 동아리 정보 수정 페이지(`/manage/clubs/{clubId}/info`) 에서 다음 시나리오 모두 확인:

- [ ] `봉사` 한글 입력 후 Enter → 칩 1개(`봉사`)만 등록. `사` 또는 `봉` 단독 칩이 추가되지 않음.
- [ ] `dev,` 콤마 입력 → `dev` 칩 1개 등록.
- [ ] 빈 input 에서 Enter → 등록 없음.
- [ ] 5개 등록까지 진행 → input 사라짐, 카운터 `5/5` 가 강조색, "최대 5개까지 추가할 수 있어요" 표시.
- [ ] 칩 1개 삭제 → input 재등장, 카운터 `4/5`, 안내 문구 사라짐.
- [ ] (선택) DB 에 직접 tags 6개짜리 행을 만들고 페이지 진입 → 6개 모두 표시, 카운터 `6/5` 가 경고색, 경고 메시지 표시, input 미노출.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx && \
git -c commit.gpgsign=false commit -m "feat(frontend): 동아리 태그 섹션 5개 제한 카운터·경고 UI"
```

- [ ] **Step 5: PR 생성**

```bash
git push -u origin fix/frontend-tags-input-ime-and-limit
gh pr create --base develop --title "fix(frontend): 동아리 태그 입력 IME 중복 등록 + 5개 제한" --body "$(cat <<'EOF'
## 🚀 작업 내용
- 동아리 정보 수정 폼의 태그 입력에서 한글 IME 가 끝날 때 Enter 가 잡혀 한 단어가 두 개로 쪼개져 등록되던 문제를 해결했다.
- 운영 정책에 맞춰 동아리당 태그 상한을 5개로 줄이고, 라벨 옆 `n/5` 카운터·5초과 경고·5도달 안내 문구를 추가했다.

## 🤔 고민했던 내용
- IME 가드는 브라우저별로 keydown 과 compositionend 의 발생 순서가 미묘하게 달라, `event.nativeEvent.isComposing` + `keyCode === 229` + React state 3중 가드로 처리했다.
- 이미 6개 이상 태그가 등록된 기존 동아리는 새 추가만 자동 차단(input 미노출)되고 기존 데이터는 손실 없이 표시·삭제만 가능하도록 했다.

## 💬 리뷰 중점사항
- 실제 한글 입력 시 `봉사` 가 단일 칩으로 정확히 등록되는지.
- 6개짜리 기존 데이터에서 경고 UI 와 input 미노출이 의도대로 동작하는지.
EOF
)"
```

---

## Task 3: PostgresFunctionContributor 에 `array_to_string` 등록

**Files:**
- Modify: `backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java`

- [ ] **Step 1: 새 브랜치 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git checkout develop && \
git pull --ff-only && \
git checkout -b feat/backend-clubs-keyword-tag-search
```

- [ ] **Step 2: 함수 등록 패턴 추가**

`PostgresFunctionContributor.java` 의 `contributeFunctions` 메서드 안, 기존 `array_overlap_csv` 등록 바로 아래에 STRING 반환용 새 등록을 추가하고, javadoc 의 호출 예 한 줄을 보강한다.

`contributeFunctions` 메서드를 아래 전체로 교체:

```java
@Override
public void contributeFunctions(FunctionContributions functionContributions) {
    BasicType<Boolean> booleanType = functionContributions
            .getTypeConfiguration()
            .getBasicTypeRegistry()
            .resolve(StandardBasicTypes.BOOLEAN);
    BasicType<String> stringType = functionContributions
            .getTypeConfiguration()
            .getBasicTypeRegistry()
            .resolve(StandardBasicTypes.STRING);

    functionContributions.getFunctionRegistry().registerPattern(
            "array_overlap_text",
            "(?1 && string_to_array(?2, ','))",
            booleanType
    );

    functionContributions.getFunctionRegistry().registerPattern(
            "array_overlap_csv",
            "(string_to_array(nullif(?1, ''), ',') && string_to_array(?2, ','))",
            booleanType
    );

    functionContributions.getFunctionRegistry().registerPattern(
            "array_to_string",
            "array_to_string(?1, ?2)",
            stringType
    );
}
```

클래스 javadoc 의 호출 예 영역에 한 줄 추가:

```java
 * 호출 예: {@code function('array_to_string', club.tags, ',')}
```

- [ ] **Step 3: 컴파일 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java && \
git -c commit.gpgsign=false commit -m "feat(backend): PostgresFunctionContributor 에 array_to_string 등록"
```

---

## Task 4: 통합 테스트 — failing 케이스 작성

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/repository/ClubRepositoryImplKeywordSearchTest.java`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

새 파일을 아래 전체 내용으로 생성한다. 8개 케이스를 한 파일에 모아 keyword 통합 검색의 모든 분기를 보장한다.

```java
package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.Club.UpdatePayload;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubRepositoryImplKeywordSearchTest {

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동아리명에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesName() {
        Long target = saveActiveClub("개발동아리", "취미 모임", List.of()).getId();
        saveActiveClub("요리부", "맛있는 모임", List.of());

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("동아리 소개에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesDescription() {
        Long target = saveActiveClub("이름A", "개발을 함께 합니다", List.of()).getId();
        saveActiveClub("이름B", "요리를 함께 합니다", List.of());

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("태그에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();
        saveActiveClub("이름B", "소개B", List.of("봉사"));

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("키워드에 # 접두어가 붙어도 태그 매치가 동작한다")
    void keywordWithHashPrefixMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("#개발").containsExactly(target);
    }

    @Test
    @DisplayName("키워드에 #이 연속되어도 모두 제거되어 태그 매치가 동작한다")
    void keywordWithMultipleHashPrefixMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("##개발").containsExactly(target);
    }

    @Test
    @DisplayName("이름·소개·태그 어디에도 키워드가 없으면 검색 결과에서 제외된다")
    void keywordWithNoMatchExcludesClub() {
        saveActiveClub("요리부", "맛있는 모임", List.of("봉사"));

        assertSearch("개발").isEmpty();
    }

    @Test
    @DisplayName("키워드가 공백·# 만으로 구성되면 keyword 필터는 비활성화되어 다른 조건만 적용된다")
    void blankKeywordDisablesOnlyKeywordPredicate() {
        Long a = saveActiveClub("요리부", "맛있는 모임", List.of("봉사")).getId();
        Long b = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("# ").containsExactlyInAnyOrder(a, b);
    }

    @Test
    @DisplayName("태그 매치는 부분 문자열 매치를 허용한다 (프론트엔드 태그가 '엔드' 키워드에 hit)")
    void tagMatchUsesSubstringSemantics() {
        Long target = saveActiveClub("이름A", "소개A", List.of("프론트엔드")).getId();

        assertSearch("엔드").containsExactly(target);
    }

    private org.assertj.core.api.ListAssert<Long> assertSearch(String keyword) {
        ClubSearchCondition condition = new ClubSearchCondition(
                null, null, keyword, null, null, null, null, null, null, ClubSortOption.ALPHABETICAL);
        Page<Club> result = clubRepository.findByCondition(condition, PageRequest.of(0, 50));
        return assertThat(result.getContent()).extracting(Club::getId);
    }

    private Club saveActiveClub(String name, String description, List<String> tags) {
        long seq = sequence.incrementAndGet();
        Club club = Club.create(
                name + "-" + seq,
                ClubCategory.ACADEMIC,
                "분과",
                description,
                null
        );
        Club saved = clubRepository.save(club);
        if (!tags.isEmpty()) {
            saved.update(new UpdatePayload(
                    null, null, null, null, null, null,
                    tags,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null));
        }
        saved.changeStatus(ClubStatus.ACTIVE, null, 1L);
        return clubRepository.save(saved);
    }
}
```

**중요**: `assertSearch` 의 컬렉션 어셔션은 추가된 fixture 만 비교하므로, `containsExactly` 가 통과하려면 다른 동아리가 결과에 없어야 한다. 같은 테스트 메서드 안에서 saveActiveClub 으로 추가된 항목과 시퀀스 suffix 가 충돌하지 않게 `name + "-" + seq` 로 유니크 처리.

`assertSearch("개발").containsExactly(target)` 같은 케이스에서 시퀀스 suffix 때문에 name 이 "개발동아리-{seq}" 이 되며 여전히 "개발" 부분 문자열 매치가 적용된다. 다른 fixture 의 name 에 "개발" 이 들어가지 않도록 작성했음.

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && \
./gradlew test --tests "com.duing.domain.club.repository.ClubRepositoryImplKeywordSearchTest"
```
Expected: 3개 테스트(`keywordMatchesTag`, `keywordWithHashPrefixMatchesTag`, `keywordWithMultipleHashPrefixMatchesTag`, `tagMatchUsesSubstringSemantics`)가 FAIL. 나머지 4개(이름/소개/매치없음/공백)는 현재 구현으로도 통과해야 함.

만약 `blankKeywordDisablesOnlyKeywordPredicate` 도 통과하지 못한다면 → 현재 `StringUtils.hasText("# ")` 가 true 라서 `"# "` 가 그대로 LIKE 패턴에 들어가 매치 없음으로 떨어진다. 이건 정상이며 Task 5 의 normalize 로직이 적용되면 통과한다.

---

## Task 5: `keywordContains` 확장 — name/description/tags ILIKE OR

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java:155-159`

- [ ] **Step 1: 메서드 교체**

`ClubRepositoryImpl.java` 의 `keywordContains` 메서드(155-159) 를 아래로 교체:

```java
private BooleanExpression keywordContains(String keyword) {
    if (!StringUtils.hasText(keyword)) return null;
    String normalized = keyword.replaceFirst("^#+", "").trim();
    if (normalized.isEmpty()) return null;

    // 기존 tagsOverlap() 와 동일하게 booleanTemplate 인자에 String 을 직접 바인딩한다.
    BooleanExpression tagMatch = Expressions.booleanTemplate(
            "function('array_to_string', {0}, {1}) ilike {2}",
            club.tags,
            ",",
            "%" + normalized + "%"
    );

    return club.name.containsIgnoreCase(normalized)
            .or(club.description.containsIgnoreCase(normalized))
            .or(tagMatch);
}
```

- [ ] **Step 2: 새 테스트 통과 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && \
./gradlew test --tests "com.duing.domain.club.repository.ClubRepositoryImplKeywordSearchTest"
```
Expected: 8개 테스트 모두 PASS.

- [ ] **Step 3: 전체 backend 테스트 회귀 확인**

Run:
```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test
```
Expected: BUILD SUCCESSFUL — 기존 ClubController/Service 테스트도 모두 통과. `keywordContains` 변경이 #prefix 정규화를 추가했으므로 #를 포함한 이름·소개 검색 케이스가 있다면 영향. 발견되면 해당 테스트의 의도를 spec 4.4 "정규화 영향 범위 주의" 메모 기준으로 검토 후 fixture 또는 기대값을 조정.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git add backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java \
        backend/src/test/java/com/duing/domain/club/repository/ClubRepositoryImplKeywordSearchTest.java && \
git -c commit.gpgsign=false commit -m "feat(backend): /clubs keyword 검색에 태그 컬럼 포함"
```

---

## Task 6: 백엔드 PR 생성

- [ ] **Step 1: 푸시 + PR 본문 작성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && \
git push -u origin feat/backend-clubs-keyword-tag-search && \
gh pr create --base develop --title "feat(backend): /clubs 검색 키워드에 태그 포함" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `/clubs?keyword=` 검색 조건을 동아리명·소개에 더해 태그 컬럼까지 OR 매치하도록 확장했다. 사용자가 `#개발` 처럼 입력해도 선행 `#` 을 모두 제거하고 양끝 공백을 정리한 정규화 키워드로 매치한다.
- Postgres 의 `array_to_string` 을 Hibernate 함수로 등록해 QueryDSL booleanTemplate 에서 사용할 수 있게 했다.

## 🤔 고민했던 내용
- 정확 매치(unnest) 대신 `array_to_string` + ILIKE 부분 매치를 채택했다. 사용자 의도(태그 단어로도 동아리가 검색됨)에 더 가깝고 구현이 단순하다. 추후 데이터 규모가 커지면 unnest + pg_trgm 인덱스로 전환할 수 있도록 설계 메모를 남겼다.
- 정규화된 키워드를 name/description 에도 동일하게 적용한다. 이름이나 소개에 실제 `#` 문자가 포함된 경우 매치가 약간 넓어질 수 있으나 실제 데이터 발생 가능성이 낮아 단순화를 우선했다.

## 💬 리뷰 중점사항
- `array_to_string` 함수 등록이 다른 도메인 쿼리에 영향이 없는지.
- 새 통합 테스트의 8개 케이스가 의도를 충분히 커버하는지.
EOF
)"
```

---

## Spec coverage 체크

- 목표 ① IME Enter 중복 금지 → Task 1 (3중 가드)
- 목표 ② maxTags 5 + `n/5` 카운터 → Task 1 + Task 2
- 목표 ③ 6개+ 기존 데이터 보존 + 신규 추가 차단 + 경고 UI → Task 2 (`tags.length > 5` 분기 + input 자동 미노출)
- 목표 ④ `/clubs?keyword=` 가 태그도 매치 → Task 3 + Task 5
- 목표 ⑤ `#` 접두어 정규화 → Task 5 의 `replaceFirst("^#+", "").trim()`
- Non-goal division 무변경 → 어떤 task 도 division 코드 변경하지 않음
- Non-goal `tags` 파라미터 동작 유지 → `tagsOverlap()` 미변경
- 후속 unnest 검토 메모 → spec 에 이미 기록, 별도 task 없음
