package com.duing.global.persistence;

/**
 * 직접 쓴 JPQL 의 LIKE 패턴 전용 이스케이프 — {@code ESCAPE '!'} 절을 적은 쿼리에만 쓴다.
 *
 * <p>QueryDSL 에는 넘기지 않는다. {@code contains}/{@code containsIgnoreCase}/{@code startsWith} 는 상수를
 * 스스로 이스케이프하고, {@code .like(상수)} 는 상수 안의 '!' 를 '!!' 로 한 번 더 바꿔(JPQLSerializer) 이 유틸의
 * 이스케이프를 깨뜨린다 — 동아리 태그 검색이 '%'·'_'·'!' 가 든 태그를 못 찾던 원인이다(#1311).
 */
public final class LikeEscapes {

    /**
     * escape 문자는 '!' 다 — 쓰는 쪽 JPQL 의 LIKE 마다 {@code ESCAPE '!'} 절이 있어야 한다. 절이 없으면
     * 이스케이프된 '!' 가 리터럴로 남아 '!'·'%'·'_' 가 든 검색어가 아무것도 찾지 못한다.
     * escape 문자 자신을 먼저 치환해야 뒤이어 삽입되는 '!' 가 다시 이스케이프되지 않는다.
     */
    public static String escape(String raw) {
        return raw.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private LikeEscapes() {
    }
}
