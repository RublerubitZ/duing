# 동아리 태그 입력 안정화 + 검색에 태그 포함

작성일: 2026-06-07
대상 브랜치: `develop`
범위: FE 2파일 · BE 2파일 (테스트 포함)

## 1. 배경

동아리 정보 수정 페이지의 태그 입력에서 한글 IME 와 Enter 키 처리가 충돌해, 한 단어를 한 번 입력해도 두 개의 태그가 등록되는 버그가 발생한다 (예: "봉사" 입력 시 `봉사` + `사`). 동시에 태그 개수 제한이 20개로 느슨해 운영상 부담이 있고, 검색창(`/clubs?keyword=`)이 동아리명·소개만 매치하기 때문에 사용자가 태그 키워드로 동아리를 찾을 수 없다.

본 변경은 (1) IME 가드로 태그 중복 등록을 막고, (2) 최대 태그 수를 5개로 줄여 카운터/안내 UI 를 노출하고, (3) 백엔드 `keyword` 검색 조건에 `tags` 컬럼을 OR 로 합쳐 통합 키워드 검색을 제공한다.

## 2. 목표 / 비목표

### 목표
- 한글·일본어 등 IME 입력 중 Enter 가 태그를 중복 등록하지 않는다.
- 동아리당 태그 최대 5개로 제한. UI 에 `n/5` 카운터와 안내 문구 노출.
- 기존에 6개 이상 태그가 등록된 동아리는 기존 태그를 손실 없이 표시하되, 새 태그 추가는 5개 이하로 줄여야만 가능.
- `/clubs?keyword=...` 호출 시 동아리명·소개에 더해 태그까지 부분 문자열 매치.
- 사용자가 `#개발`처럼 `#` 접두어를 붙여 검색해도 정상 매치.

### 비목표 (Out of Scope)
- division 필드를 일반(비중앙) 동아리에서 노출하는 변경. 현재 중앙동아리 전용으로 유지.
- 별도 "태그 필터" UI 추가. 백엔드의 `tags` 쿼리 파라미터(기존 `array_overlap_text`)는 현 동작 유지.
- Tag 의 별도 엔티티화/조인 테이블 정규화.
- 기존 데이터의 자동 정리(6개 이상 태그를 일괄 잘라내는 마이그레이션).
- 동아리 생성 폼·관리자 화면 등 수정 페이지 외 화면의 TagsInput 사용처. (현재 사용처는 수정 페이지뿐임을 확인했으나, 다른 사용처가 추가되더라도 prop 기본값으로 자동 적용된다.)

## 3. 변경 대상

### Frontend
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx`
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`

### Backend
- `backend/src/main/java/com/duing/global/config/PostgresFunctionContributor.java`
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`
- 테스트: `backend/src/test/.../club/repository/ClubRepositoryImplTest.java` (또는 동등 위치)

## 4. 상세 설계

### 4.1 TagsInput — IME 가드 + maxTags 5

`maxTags` 기본값을 5 로 변경하고, IME 조합 상태를 명시적으로 추적한다.

```tsx
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

  // ...

  <input
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
  />
```

가드를 3중으로 둔 이유:
- `event.nativeEvent.isComposing`: 표준. 대부분의 브라우저에서 IME 조합 중에는 true.
- `event.keyCode === 229`: 일부 환경(특히 구버전 Safari/Edge)에서 `isComposing` 이 누락되지만 keyCode 229 는 안정적.
- React state `isComposing`: composition 이벤트와 keydown 이벤트의 순서가 브라우저별로 미묘하게 다르므로 자체 추적치를 추가로 둠. blur 핸들러에서도 활용.

### 4.2 ClubInfoForm — 카운터 + 5개 초과 경고

태그 섹션 헤더에 `n/5` 카운터를 표기하고, 두 가지 안내 메시지를 분기한다.

- `value.length === 5`: "최대 5개까지 추가할 수 있어요" (info 톤)
- `value.length > 5` (기존 데이터): "이전에 등록된 태그가 5개를 초과합니다. 새 태그를 추가하려면 먼저 일부를 삭제해 주세요." (warning 톤, 노란/주황 강조)
- `value.length < 5`: 카운터(`n/5`)만 표시, 별도 안내 없음

`TagsInput` 자체는 `value.length < maxTags` 일 때만 input 을 렌더하므로 5개 이상이면 자동으로 입력창이 숨겨진다. 6개 이상 기존 데이터일 때도 동일한 규칙으로 입력창이 숨겨지므로 추가 등록이 자연스럽게 차단된다. 삭제 버튼은 항상 노출된다.

`buildPayload()` 의 tags diff 로직은 그대로 둔다 (`!arraysEqual(tags, detail.tags)` 비교) — 사용자가 6→5 로 줄이면 정상적으로 patch 가 전송된다.

### 4.3 PostgresFunctionContributor — array_to_string 등록

기존 `array_overlap_text` 와 동일한 패턴으로 `array_to_string` 함수를 등록한다.

```java
import org.hibernate.type.StandardBasicTypes;

functionContributions.getFunctionRegistry().registerPattern(
        "array_to_string",
        "array_to_string(?1, ?2)",
        functionContributions.getTypeConfiguration()
                .getBasicTypeRegistry()
                .resolve(StandardBasicTypes.STRING)
);
```

Postgres 내장 함수지만 Hibernate 6 에서 명시 등록하지 않으면 HQL 파서가 `function('array_to_string', ...)` 호출을 거부하므로 contributor 에 명시적으로 추가한다.

### 4.4 ClubRepositoryImpl.keywordContains 확장

기존:
```java
private BooleanExpression keywordContains(String keyword) {
    if (!StringUtils.hasText(keyword)) return null;
    return club.name.containsIgnoreCase(keyword)
            .or(club.description.containsIgnoreCase(keyword));
}
```

변경 후:
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

#### 설계 메모

- **`#` 정규화**: `replaceFirst("^#+", "")` 로 선행 `#` 을 모두 제거한다 (`#`, `##개발` 등 모두 `개발` 로). `trim()` 으로 양끝 공백도 정리해, `# 개발` 입력 시 빈 토큰이 되지 않게 한다. 빈 문자열이면 null 반환(필터 비활성).
- **정규화 영향 범위 주의**: 정규화된 `normalized` 는 name·description·tag 매치 모두에 사용된다. 이름이나 소개에 실제 `#` 문자가 포함된 경우 매치 폭이 약간 넓어질 수 있으나(예: 이름 `"#1동아리"` 가 `keyword="#1"` 검색에서 더 넓게 잡힘), 실제 데이터에서 발생 가능성은 매우 낮아 허용한다. 필요해지면 name/description 매치는 원문 `keyword` 로, tag 매치만 `normalized` 로 분리할 수 있다.
- **태그 매치 방식**: `array_to_string(tags, ',')` 결과에 ILIKE `%개발%` 매치. 이름·소개와 동일한 부분 문자열 시맨틱을 유지한다.
- **현재 트레이드오프**: `array_to_string` 매치는 태그 경계를 무시한다 — 예: `["프론트엔드개발"]` 도 "개발" 검색에 잡힌다. 사용자 의도와 일치하는 동작으로 판단해 그대로 둔다. 추후 정확한 단어 단위 매치가 필요해지면 `unnest(tags)` 를 활용한 EXISTS 서브쿼리로 전환을 검토할 수 있다(아래 후속 검토 메모 참조).
- **`tags` 파라미터와의 관계**: 기존 `tagsOverlap()` 필터는 그대로 유지. `keyword` 와 `tags` 는 AND 로 합쳐지므로, 사용자가 두 가지를 동시에 사용해도 의도대로 동작한다.

#### 후속 검토 메모 — unnest 전환

`array_to_string` 기반 ILIKE 는 다음 한계가 있다:

1. 태그 경계를 무시한 부분 매치 (`프론트엔드` 태그가 "엔드" 검색에 잡힘).
2. 인덱스 활용 불가 — 큰 데이터셋에서 시퀀셜 스캔.

데이터 규모가 커지거나 정확 매치 요구가 강해지면 다음으로 전환을 검토한다:

```sql
EXISTS (
  SELECT 1 FROM unnest(club.tags) AS t
  WHERE t ILIKE :keyword OR t = :keyword
)
```

추가로 `pg_trgm` GIN 인덱스를 `tags` 컬럼(혹은 `array_to_string(tags)` 표현식)에 걸어 ILIKE 성능을 개선할 수 있다. 본 변경에서는 데이터 규모가 작아 도입하지 않는다.

## 5. 테스트 계획

### 5.1 백엔드 통합 테스트 (`ClubRepositoryImplTest`, TestContainers + Postgres)

기존 ClubRepositoryImpl 통합 테스트 패턴과 동일하게 TestContainers(`@Testcontainers` + Postgres 이미지)로 실제 Postgres 에 대해 검증한다. `array_to_string` 은 Postgres 전용 함수이므로 H2/embedded DB 로는 검증 불가.

| 케이스 | 데이터 | 입력 | 기대 결과 |
| --- | --- | --- | --- |
| 이름만 매치 | name="개발동아리", description="x", tags=[] | keyword="개발" | hit |
| 소개만 매치 | name="x", description="개발을 함", tags=[] | keyword="개발" | hit |
| 태그만 매치 | name="x", description="x", tags=["개발"] | keyword="개발" | hit |
| `#` 정규화 | name="x", description="x", tags=["개발"] | keyword="#개발" | hit |
| `##` 정규화 | tags=["개발"] | keyword="##개발" | hit |
| 매치 실패 | name="요리", tags=["봉사"] | keyword="개발" | miss |
| 공백 정규화 | tags=["개발"] | keyword="# " | keyword 조건 비활성 (다른 필터만 적용) |
| 부분 문자열 | tags=["프론트엔드"] | keyword="엔드" | hit (설계상 허용) |

### 5.2 프론트엔드 수동 검증 체크리스트

- [ ] `봉사` 한글 입력 후 Enter → `봉사` 1개만 등록
- [ ] `dev,` 콤마 입력 → `dev` 등록
- [ ] 빈 input 에서 Enter → 등록 안 됨
- [ ] 5개 등록 후 input 사라지고 "최대 5개" 안내 노출
- [ ] (수동 fixture) 6개짜리 동아리 진입 → 6개 모두 표시 + 경고 메시지 노출 + input 미노출
- [ ] 1개 삭제 후 input 재등장, 카운터 4/5

### 5.3 통합 동작 검증

- 태그 `["#개발"]` 등록 후 `/clubs?keyword=개발` → 해당 동아리 노출
- `/clubs?keyword=%23개발` (URL 인코딩된 `#개발`) → 동일 결과

## 6. 리스크 / 영향도

- DB 스키마 변경 없음. Flyway 마이그레이션 불필요.
- Hibernate 함수 등록 누락 시 검색 API 가 500 에러로 떨어진다 → 통합 테스트로 보호.
- 6개 이상 태그를 가진 기존 동아리(있다면)는 신규 추가만 막히고 표시·삭제는 정상 동작. 별도 마이그레이션 불필요.
- 검색이 태그까지 확장되며 일부 동아리가 새로 결과에 포함될 수 있다. 사용자 의도와 일치.

## 7. 작업 분리 (브랜치/PR)

원칙(API 1개 = 브랜치 1개)에 맞춰 2개 PR 로 분리한다.

1. `fix/frontend-tags-input-ime-and-limit`
   - TagsInput IME 가드 + maxTags 5 + ClubInfoForm 카운터/경고 UI
2. `feat/backend-clubs-keyword-tag-search`
   - PostgresFunctionContributor `array_to_string` 등록
   - ClubRepositoryImpl.keywordContains 확장 + 단위 테스트

순서: 1 → 2 (의존 없음, 병렬도 가능하지만 충돌 방지 위해 순차).
