package com.duing.global.constant;

/**
 * 공개 목록 검색어 길이 규칙(#1315→#1322) — 동아리·공지·FAQ 검색의 keyword 파라미터가 같이 쓴다.
 *
 * <p>제약은 Api 인터페이스와 Controller 양쪽에 <b>이 상수로</b> 단다. Hibernate Validator 는 구현 쪽 파라미터 제약이
 * 인터페이스와 한 글자라도 다르면 ConstraintDeclarationException 을 던지고, 그러면 그 엔드포인트의 모든 요청이 500 이 된다.
 * 100 은 FAQ 무결과 기록 상한(FederationFaqSearchMissRecorder.MAX_KEYWORD_LENGTH, VARCHAR(100))과 동아리 이름 최대 길이에 맞춘 값이다.
 */
public final class SearchKeywordRules {

    public static final int MAX_LENGTH = 100;
    public static final String MESSAGE = "검색어는 100자 이하로 입력해주세요.";

    private SearchKeywordRules() {
    }
}
