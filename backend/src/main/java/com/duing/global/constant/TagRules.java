package com.duing.global.constant;

import java.text.Normalizer;
import java.util.Collection;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * 태그의 공통 규칙 — 입력 검증 패턴과 저장 전 정규화.
 *
 * <p>쉼표는 태그 필터({@code tags=a,b})의 구분자라 쉼표가 든 태그는 그 태그로 찾을 수 없다(#1338).
 * 같은 규칙을 쓰는 곳: 동아리 리더·총동연 수정({@code ClubProfileValidationRules.TAG_PATTERN}),
 * 공지 작성·수정({@code CreateNoticeRequest}·{@code UpdateNoticeRequest}).
 *
 * <p>{@link #normalize} 는 엔티티가 태그를 저장하기 직전에 부른다({@code Club.update},
 * {@code Notice.create}·{@code update}). 검증을 통과한 값도 보이지 않는 문자·앞뒤 공백·앞의 '#' 를 지우고 빈 값·중복을
 * 버려, 같아 보이는 태그가 따로 저장되지 않게 한다. 동아리 키워드 검색도 검색어를 {@link #normalizeTag} 로 정리해 태그와 맞춘다.
 * 제어문자(유니코드 Cc, U+001F 포함)는 직접 칠 수는 없지만 붙여넣기·API 로 들어올 수 있고, 키워드 검색이 태그를
 * U+001F 로 이어 붙이므로(#1340) 남겨 두면 그 태그를 찾을 수 없다. 탭·개행도 제어문자라 지우면 앞뒤 글자가 붙는다.
 */
public final class TagRules {

    public static final String NO_COMMA_PATTERN = "[^,]*";

    public static final String NO_COMMA_MESSAGE = "태그에는 쉼표(,)를 넣을 수 없습니다.";

    // 제어문자(Cc, C1 포함 — \p{Cntrl} 은 ASCII 만 잡는다)와 서식 문자(Cf: ZWSP·BOM·방향 제어 등)를 지운다.
    // 이모지 조합에 쓰는 ZWJ(U+200D)·ZWNJ(U+200C)는 남긴다.
    private static final Pattern INVISIBLE_CHARACTERS = Pattern.compile("[\\p{Cc}\\p{Cf}&&[^\\u200C\\u200D]]");

    // 공백처럼 보이는 한글 채움 문자(U+115F·U+1160·U+3164·U+FFA0)와 점자 공백(U+2800) — 범주가 글자라 strip() 이 못 지운다.
    private static final Pattern BLANK_LOOKING_LETTERS = Pattern.compile("[\\u115F\\u1160\\u3164\\uFFA0\\u2800]");

    // strip() 이 공백으로 보지 않는 줄바꿈 없는 공백 — Club.normalizeDepartment 처럼 일반 공백으로 바꾼 뒤 자른다.
    private static final Pattern NO_BREAK_SPACES = Pattern.compile("[\\u00A0\\u2007\\u202F]");

    // 화면이 태그 앞에 '#' 를 붙여 보여 주므로 저장값에서는 앞의 '#' 를 뗀다.
    // 키캡 이모지('#' + 변형 선택자(없거나 U+FE0E·U+FE0F) + U+20E3)의 '#' 는 남기고, 떼는 '#' 뒤의 변형 선택자는 함께 뗀다.
    // 반복은 소유 수량자(++)로 둔다 — 길이가 일정하지 않은 그룹의 반복은 글자마다 재귀해, 길이 제한이 없는 키워드 검색어의
    // 긴 '#' 에서 스택이 넘친다.
    private static final Pattern LEADING_HASHES = Pattern.compile("^(?:#(?![\\uFE0E\\uFE0F]?\\u20E3)[\\uFE0E\\uFE0F]?)++");

    // 결합 문자·서식 문자·공백만 남은 태그(홀로 남은 ZWJ·변형 선택자 등)는 빈 칩으로 보인다. 범주를 모르는 글자(미지정)·사용자 정의
    // 글자는 보이는 글자로 친다 — 브라우저와 서버의 유니코드 버전이 달라도 새로 생긴 글자의 판정이 같다(새로 생긴 결합 문자만 다르다).
    private static final Pattern VISIBLE_CHARACTER = Pattern.compile("[^\\p{M}\\p{Cf}\\p{Z}]");

    private TagRules() {
        // 상수·정적 메서드 모음 — 인스턴스화 금지
    }

    /** null·보이지 않는 문자·앞뒤 공백·앞의 '#' 를 지우고(한글은 NFC 로 합친다) 빈 값·보이는 글자가 없는 값과 중복을 버린다(처음 나온 순서 유지). */
    public static String[] normalize(Collection<String> tags) {
        return tags.stream()
                .filter(Objects::nonNull)
                .map(TagRules::normalizeTag)
                .filter(tag -> !tag.isEmpty())
                .distinct()
                .toArray(String[]::new);
    }

    /** 태그 하나를 저장 규칙으로 정리한다. 보이는 글자가 없으면 빈 문자열을 돌려준다. */
    public static String normalizeTag(String tag) {
        // 보이지 않는 문자를 먼저 지워야 그 사이에 끼어 있던 분해된 한글도 NFC 로 합쳐진다.
        String visible = INVISIBLE_CHARACTERS.matcher(tag).replaceAll("");
        String letters = BLANK_LOOKING_LETTERS.matcher(visible).replaceAll("");
        String composed = Normalizer.normalize(letters, Normalizer.Form.NFC);
        String result = NO_BREAK_SPACES.matcher(composed).replaceAll(" ").strip();
        // "# #축구" 처럼 '#' 와 공백이 섞여 있어도 끝까지 뗀다.
        while (LEADING_HASHES.matcher(result).find()) {
            result = LEADING_HASHES.matcher(result).replaceFirst("").strip();
        }
        return VISIBLE_CHARACTER.matcher(result).find() ? result : "";
    }
}
