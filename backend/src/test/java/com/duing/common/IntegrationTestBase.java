package com.duing.common;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 통합 테스트 공통 기반 클래스.
 *
 * <p>각 테스트 메서드 전에 DB 의 모든 도메인 테이블을 TRUNCATE 해 테스트 간 데이터 오염을 방지한다.
 * RestAssured 컨트롤러 테스트처럼 @Transactional rollback 이 불가능한 HTTP 레벨 테스트에 사용한다.
 *
 * <p>대상 테이블은 하드코딩하지 않고 {@code information_schema} 에서 읽는다. 손으로 관리하던 62개 목록은
 * 두 방향으로 모두 틀어졌다 — 새로 생긴 테이블은 아무도 목록에 넣지 않아(club_metric, V110) club FK 의
 * CASCADE 에 우연히 얹혀 지워질 뿐이었고(FK 가 사라지는 순간 조용히 누출된다), 반대로 마이그레이션 시드가
 * 있는 테이블이 목록에 섞여 들어가(federation_faq_category, V73 의 5행) 매 테스트 시드가 사라졌다.
 * 스키마를 원천으로 삼고 보존 대상만 명시하면 두 사고 모두 구조적으로 재발하지 않는다.
 *
 * <p>목록 조회는 JVM 당 1회만 하고 완성된 문장을 캐시한다(테스트마다 재조회 금지).
 * CASCADE 로 FK 참조 순서를 신경 쓰지 않고, RESTART IDENTITY 로 PK 시퀀스도 초기화해 id 누출을 없앤다.
 */
public abstract class IntegrationTestBase {

    /**
     * TRUNCATE 대상에서 제외하는 테이블.
     *
     * <ul>
     *   <li>{@code flyway_schema_history} — Flyway 마이그레이션 이력</li>
     *   <li>{@code facility_booking_purpose_preset}(V84) · {@code federation_faq_category}(V73)
     *       — 마이그레이션이 넣은 시드 행을 보존한다(운영과 같은 기본값 위에서 테스트한다)</li>
     *   <li>{@code recertification_round} · {@code recertification_request}
     *       — 매핑 엔티티가 없는 고아 테이블(DROP 은 별건). 제외는 의도 기록용이다 —
     *       request 는 club 을 참조해 어차피 CASCADE 로 비워진다</li>
     * </ul>
     */
    private static final Set<String> PRESERVED_TABLES = Set.of(
            "flyway_schema_history",
            "facility_booking_purpose_preset",
            "federation_faq_category",
            "recertification_round",
            "recertification_request");

    private static String truncateStatement;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        if (truncateStatement == null) {
            truncateStatement = buildTruncateStatement();
        }
        jdbcTemplate.execute(truncateStatement);
    }

    private String buildTruncateStatement() {
        List<String> targetTables = jdbcTemplate.queryForList("""
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_type = 'BASE TABLE'
                        ORDER BY table_name
                        """, String.class).stream()
                .filter(tableName -> !PRESERVED_TABLES.contains(tableName))
                .toList();
        return "TRUNCATE TABLE " + String.join(", ", targetTables) + " RESTART IDENTITY CASCADE";
    }
}
