package com.duing.domain.federation.service.dto.query;

/**
 * 총동연 FAQ 공개 검색(비로그인) 조건. {@code FederationFaqAdminSearchCondition}(admin 검색)과는 별개다.
 */
public record FederationFaqSearchCondition(
        Long categoryId,
        String keyword
) {

    // keyword를 strip + 연속 공백 1개 압축해 저장한다(대소문자는 유지 — containsIgnoreCase가 흡수).
    // 유니코드 공백(NBSP 등 \p{Z}) 포함 — Java \s만으로는 NBSP가 안 잡혀 시각적으로 같은 키워드가 갈라진다.
    // 검색 술어(FederationFaqRepositoryImpl.keywordContains)와 무결과 기록(FederationFaqSearchMissRecorder)이
    // 같은 키워드 형태를 공유해야 "기록된 키워드 = 실제로 0건이었던 키워드"가 성립한다. 압축 결과가
    // blank면 키워드 없음(null)과 동일하게 취급한다.
    public FederationFaqSearchCondition {
        if (keyword != null) {
            String normalizedKeyword = keyword.strip().replaceAll("[\\s\\p{Z}]+", " ");
            keyword = normalizedKeyword.isBlank() ? null : normalizedKeyword;
        }
    }
}
