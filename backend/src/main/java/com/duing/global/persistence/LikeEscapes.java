package com.duing.global.persistence;

/**
 * 직접 조립하는 LIKE 패턴 전용 이스케이프 — escape 문자 '!' 를 명시한 LIKE(직접 쓴 JPQL 의 {@code ESCAPE '!'},
 * 템플릿의 {@code like ... escape '!'}, QueryDSL {@code .like(pattern, '!')})에만 쓴다.
 *
 * <p>QueryDSL {@code .like(상수)} 에는 넘기지 않는다 — 상수 안의 '!' 를 '!!' 로 한 번 더 바꿔(JPQLSerializer)
 * 이스케이프가 깨진다(#1311). {@code contains}/{@code containsIgnoreCase}/{@code startsWith} 는 상수를 스스로
 * 이스케이프하므로 이 유틸이 필요 없다.
 */
public final class LikeEscapes {

    /**
     * escape 문자는 '!' 다 — 쓰는 쪽 LIKE 에 '!' 를 escape 로 지정하지 않으면 '!' 는 리터럴로 남고 '%'·'_' 는
     * 와일드카드로 살아, 검색어와 상관없는 행이 걸리거나 찾던 행이 빠진다.
     * escape 문자 자신을 먼저 치환해야 뒤이어 삽입되는 '!' 가 다시 이스케이프되지 않는다.
     */
    public static String escape(String raw) {
        return raw.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private LikeEscapes() {
    }
}
