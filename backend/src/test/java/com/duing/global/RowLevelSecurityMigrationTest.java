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

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RowLevelSecurityMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("public 스키마의 모든 테이블에 RLS 가 켜져 있다 — 신규 마이그레이션이 RLS 를 누락하면 실패한다")
    void allPublicTablesHaveRowLevelSecurityEnabled() {
        // flyway_schema_history(Flyway 내부 제어 테이블)는 V59 에서 의도적으로 제외하므로 검사 대상에서 뺀다.
        List<String> tablesWithoutRls = jdbcTemplate.queryForList(
                "SELECT c.relname FROM pg_class c "
                        + "JOIN pg_namespace n ON c.relnamespace = n.oid "
                        + "WHERE n.nspname = 'public' AND c.relkind = 'r' "
                        + "AND c.relrowsecurity = false "
                        + "AND c.relname <> 'flyway_schema_history'",
                String.class);

        assertThat(tablesWithoutRls).isEmpty();
    }
}
