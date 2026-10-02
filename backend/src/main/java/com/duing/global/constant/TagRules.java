package com.duing.global.constant;

import java.util.Collection;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * 태그의 공통 규칙 — 입력 검증 패턴과 저장 전 정규화.
 *
 * <p>쉼표는 태그 필터({@code tags=a,b})의 구분자라 쉼표가 든 태그는 그 태그로 찾을 수 없다(#1338).
 * 같은 규칙을 쓰는 곳: 동아리 리더·총동연 수정({@code ClubProfileValidationRules.TAG_PATTERN}).
 *
 * <p>{@link #normalize} 는 엔티티가 태그를 저장하기 직전에 부른다({@code Club.update}). 검증을 통과한 값도
 * 앞뒤 공백·제어문자를 지우고 빈 값·중복을 버린다. 제어문자(U+001F 포함)는 화면에서는 입력할 수 없지만 API 로는
 * 들어올 수 있고, 키워드 검색이 태그를 U+001F 로 이어 붙이므로(#1340) 남겨 두면 그 태그를 찾을 수 없다.
 * 탭·개행도 제어문자라 지우면 앞뒤 글자가 붙는다.
 */
public final class TagRules {

    public static final String NO_COMMA_PATTERN = "[^,]*";

    public static final String NO_COMMA_MESSAGE = "태그에는 쉼표(,)를 넣을 수 없습니다.";

    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("\\p{Cntrl}");

    private TagRules() {
        // 상수·정적 메서드 모음 — 인스턴스화 금지
    }

    /** null·제어문자·앞뒤 공백을 지우고 빈 값과 중복을 버린다(처음 나온 순서 유지). */
    public static String[] normalize(Collection<String> tags) {
        return tags.stream()
                .filter(Objects::nonNull)
                .map(tag -> CONTROL_CHARACTERS.matcher(tag).replaceAll("").strip())
                .filter(tag -> !tag.isEmpty())
                .distinct()
                .toArray(String[]::new);
    }
}
