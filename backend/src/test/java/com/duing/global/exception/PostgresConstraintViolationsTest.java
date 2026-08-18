package com.duing.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * strict 판정 계약 검증: 지정한 제약 위반에만 true, 그 외(다른 제약·다른 SQLState·
 * 비 SQLException 원인·메시지 없음)는 전부 false 로 호출측 전파에 맡긴다.
 */
class PostgresConstraintViolationsTest {

    private static final String CONSTRAINT = "uk_sample_active";

    @Test
    @DisplayName("23505 + 지정 제약명이 메시지에 있으면 unique 위반으로 판정한다")
    void uniqueViolationOfMatchingConstraintIsTrue() {
        DataIntegrityViolationException exception = withCause(
                new SQLException("duplicate key value violates unique constraint \"uk_sample_active\"", "23505"));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isTrue();
    }

    @Test
    @DisplayName("23505 라도 다른 제약명이면 false — 새 제약 위반이 409 로 둔갑하지 않는다")
    void uniqueViolationOfDifferentConstraintIsFalse() {
        DataIntegrityViolationException exception = withCause(
                new SQLException("duplicate key value violates unique constraint \"uk_other\"", "23505"));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isFalse();
    }

    @Test
    @DisplayName("제약명이 같아도 SQLState 가 다르면(FK 23503 등) false")
    void differentSqlStateIsFalse() {
        DataIntegrityViolationException exception = withCause(
                new SQLException("violates foreign key constraint \"uk_sample_active\"", "23503"));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isFalse();
    }

    @Test
    @DisplayName("원인 체인에 SQLException 이 없으면 false")
    void nonSqlExceptionCauseIsFalse() {
        DataIntegrityViolationException exception =
                new DataIntegrityViolationException("wrapper", new IllegalStateException("not sql"));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isFalse();
    }

    @Test
    @DisplayName("SQLException 메시지가 null 이면 false")
    void nullMessageIsFalse() {
        DataIntegrityViolationException exception = withCause(new SQLException((String) null, "23505"));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isFalse();
    }

    @Test
    @DisplayName("23P01 + 지정 제약명이면 EXCLUDE 위반으로 판정하고, 23505 는 EXCLUDE 판정에서 false")
    void exclusionViolationRequiresExclusionSqlState() {
        DataIntegrityViolationException exclusion = withCause(new SQLException(
                "conflicting key value violates exclusion constraint \"excl_sample_active_overlap\"", "23P01"));
        DataIntegrityViolationException unique = withCause(new SQLException(
                "duplicate key value violates unique constraint \"excl_sample_active_overlap\"", "23505"));

        assertThat(PostgresConstraintViolations.isExclusionViolationOf(exclusion, "excl_sample_active_overlap"))
                .isTrue();
        assertThat(PostgresConstraintViolations.isExclusionViolationOf(unique, "excl_sample_active_overlap"))
                .isFalse();
    }

    @Test
    @DisplayName("중첩 원인 체인에서도 가장 구체적인 SQLException 으로 판정한다")
    void nestedCauseChainIsUnwrapped() {
        SQLException root = new SQLException(
                "duplicate key value violates unique constraint \"uk_sample_active\"", "23505");
        DataIntegrityViolationException exception =
                new DataIntegrityViolationException("wrapper", new RuntimeException("mid", root));

        assertThat(PostgresConstraintViolations.isUniqueViolationOf(exception, CONSTRAINT)).isTrue();
    }

    private static DataIntegrityViolationException withCause(SQLException sqlException) {
        return new DataIntegrityViolationException("wrapper", sqlException);
    }
}
