package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * RLS 와 그 우회 경로(뷰·SECURITY DEFINER)의 회귀 가드(#1323) — Flyway 마이그레이션이 만든 객체만 지킨다.
 * 운영 DB 에 대시보드 등으로 직접 만든 뷰·함수는 여기서 잡히지 않으므로, 같은 카탈로그 쿼리를 운영 DB 에서 읽기 전용으로 돌려 확인한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RowLevelSecurityMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("public 스키마의 모든 테이블(파티션 부모 포함)에 RLS 가 켜져 있다 — 신규 마이그레이션이 RLS 를 누락하면 실패한다")
    void allPublicTablesHaveRowLevelSecurityEnabled() {
        // flyway_schema_history 는 Flyway 가 직접 만드는 이력 테이블이라 제외한다 — 마이그레이션으로 RLS 를 켜는 것과
        // Data API 노출 차단은 #1323 후속(REVOKE·Data API)에서 다룬다.
        List<String> tablesWithoutRls = jdbcTemplate.queryForList(
                "SELECT c.relname FROM pg_class c "
                        + "JOIN pg_namespace n ON c.relnamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') "
                        + "AND c.relrowsecurity = false "
                        + "AND c.relname <> 'flyway_schema_history'",
                String.class);
        // 마이그레이션 대상 스키마가 public 이 아니게 바뀌면 이 클래스의 단언이 모두 빈 결과로 조용히 통과한다 —
        // 검사할 테이블이 실제로 있는지 함께 본다.
        Integer tablesWithRls = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM pg_class c "
                        + "JOIN pg_namespace n ON c.relnamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity",
                Integer.class);

        assertThat(tablesWithoutRls).isEmpty();
        assertThat(tablesWithRls).isPositive();
    }

    @Test
    @DisplayName("public 스키마에 뷰·머티리얼라이즈드 뷰가 없다 — 소유자 권한으로 실행돼 RLS 를 우회한다")
    void noViewsInPublicSchema() {
        // 허용이 필요해지면 security_invoker 조건을 더한다. reloptions 표기는 정규화되지 않는다(on·true·1 모두 받아야 한다).
        // 머티리얼라이즈드 뷰는 security_invoker 가 없어 늘 금지다.
        List<String> views = jdbcTemplate.queryForList(
                "SELECT c.relname FROM pg_class c "
                        + "JOIN pg_namespace n ON c.relnamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')",
                String.class);

        assertThat(views).isEmpty();
    }

    @Test
    @DisplayName("public 스키마에 확장이 소유하지 않은 SECURITY DEFINER 함수가 없다 — 소유자 권한으로 RLS 를 우회한다")
    void noSecurityDefinerFunctionsOutsideExtensions() {
        // btree_gist(V82) 같은 확장 함수는 pg_depend deptype='e' 로 빠진다.
        List<String> securityDefinerFunctions = jdbcTemplate.queryForList(
                "SELECT p.proname FROM pg_proc p "
                        + "JOIN pg_namespace n ON p.pronamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND p.prosecdef "
                        + "AND NOT EXISTS (SELECT 1 FROM pg_depend d "
                        + "WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')",
                String.class);

        assertThat(securityDefinerFunctions).isEmpty();
    }
}
