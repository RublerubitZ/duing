package com.duing.domain.interview.repository;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;

/**
 * interview_* 테이블의 DB CHECK 제약 조건을 검증하는 스키마 통합 테스트.
 *
 * <p>JdbcTemplate 으로 SQL 을 직접 실행하고 {@link DataIntegrityViolationException} 발생 여부를 확인한다.
 * FK 제약을 우회하기 위해 테스트 직전 {@code SET session_replication_role = 'replica'} 를 실행한다.
 * PostgreSQL 에서 이 설정은 FK 트리거를 비활성화하지만 CHECK 제약은 정상 동작한다.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class InterviewSchemaTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("interview_schedule.status 가 ASSIGNED/CANCELLED 외 값이면 CHECK 위반이 발생한다")
    void rejectsInvalidInterviewScheduleStatus() {
        jdbcTemplate.execute("SET session_replication_role = 'replica'");

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_schedule
                            (application_id, slot_id, recruitment_id, status, assigned_at, created_at, updated_at)
                        VALUES (1, 1, 1, 'INVALID_STATUS', now(), now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot 의 end_time 이 start_time 이전이면 CHECK 위반이 발생한다")
    void rejectsSlotWithEndTimeBeforeStartTime() {
        jdbcTemplate.execute("SET session_replication_role = 'replica'");

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (recruitment_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (1, now() + interval '1 hour', now(), 5, now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot.capacity 가 0 이하이면 CHECK 위반이 발생한다")
    void rejectsSlotWithNonPositiveCapacity() {
        jdbcTemplate.execute("SET session_replication_role = 'replica'");

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (recruitment_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (1, now(), now() + interval '1 hour', 0, now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
