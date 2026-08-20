package com.duing.global.exception;

import java.sql.SQLException;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * PostgreSQL 제약 위반을 "지정한 제약 하나"로만 좁혀 판정하는 strict 헬퍼.
 *
 * <p>지정 제약 위반에만 true 를 반환하므로, 향후 같은 테이블에 새 unique / CHECK / FK 가
 * 추가되어도 그 위반은 409 등으로 둔갑하지 않고 호출측에서 그대로 위로 전파된다.
 *
 * <p>Hibernate 의 getConstraintName 이 SQLState 에 따라 null 일 수 있어
 * SQLState + 제약명 메시지 매칭으로 판정한다(모집 도메인 전례).
 */
public final class PostgresConstraintViolations {

    /** PostgreSQL unique_violation. */
    private static final String UNIQUE_VIOLATION_SQL_STATE = "23505";
    /** PostgreSQL exclusion_violation (EXCLUDE 제약). */
    private static final String EXCLUSION_VIOLATION_SQL_STATE = "23P01";

    private PostgresConstraintViolations() {
    }

    /**
     * 지정한 unique 제약(23505) 위반인지만 true.
     */
    public static boolean isUniqueViolationOf(DataIntegrityViolationException exception, String constraintName) {
        return isViolationOf(exception, UNIQUE_VIOLATION_SQL_STATE, constraintName);
    }

    /**
     * 지정한 EXCLUDE 제약(23P01) 위반인지만 true.
     */
    public static boolean isExclusionViolationOf(DataIntegrityViolationException exception, String constraintName) {
        return isViolationOf(exception, EXCLUSION_VIOLATION_SQL_STATE, constraintName);
    }

    private static boolean isViolationOf(DataIntegrityViolationException exception, String sqlState,
                                         String constraintName) {
        Throwable mostSpecific = exception.getMostSpecificCause();
        if (!(mostSpecific instanceof SQLException sqlException)) {
            return false;
        }
        if (!sqlState.equals(sqlException.getSQLState())) {
            return false;
        }
        String message = sqlException.getMessage();
        return message != null && message.contains(constraintName);
    }
}
