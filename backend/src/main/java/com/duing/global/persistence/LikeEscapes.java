package com.duing.global.persistence;

/**
 * 수동으로 조립하는 LIKE 패턴 전용 이스케이프.
 *
 * <p>QueryDSL 의 {@code contains}/{@code containsIgnoreCase}/{@code startsWith} 는 상수 인자를 자동으로
 * 이스케이프하므로 대상이 아니다. 사용자 입력을 {@code "%" + input + "%"} 처럼 직접 이어 붙이거나
 * JPQL 의 {@code CONCAT} 으로 패턴을 만드는 자리에서만 쓴다.
 */
public final class LikeEscapes {

    /**
     * JPQL 기본 escape 문자('!')와 정합한다 — QueryDSL {@code JPQLTemplates.DEFAULT_ESCAPE} 와 같은 값이라
     * 수동 패턴과 자동 이스케이프 패턴이 한 쿼리에 섞여도 escape 절이 어긋나지 않는다.
     * escape 문자 자신을 먼저 치환해야 뒤이어 삽입되는 '!' 가 다시 이스케이프되지 않는다.
     *
     * <p>쓰는 쪽은 LIKE 에 {@code ESCAPE '!'} 절이 붙어 있는지 확인해야 한다. QueryDSL 의
     * {@code Ops.LIKE} 는 절을 항상 방출하지만, 직접 쓴 JPQL 은 명시해야 한다.
     */
    public static String escape(String raw) {
        return raw.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private LikeEscapes() {
    }
}
