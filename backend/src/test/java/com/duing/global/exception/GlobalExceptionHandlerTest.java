package com.duing.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.global.response.ApiResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("DB 유니크 제약 위반이 발생하면 409 CONFLICT 와 일반화된 메시지를 반환한다")
    void uniqueViolation_returnsConflict() {
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "could not execute statement",
                new RuntimeException("duplicate key value violates unique constraint \"uk_users_student_id_active\"")
        );

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().ok()).isFalse();
        assertThat(response.getBody().message())
                .isEqualTo("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }

    @Test
    @DisplayName("DB 외래키 제약 위반도 동일한 409 CONFLICT 응답으로 일반화한다")
    void foreignKeyViolation_returnsConflict() {
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "could not execute statement",
                new RuntimeException("violates foreign key constraint \"fk_application_recruitment\"")
        );

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().message())
                .isEqualTo("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }

    @Test
    @DisplayName("시설 예약 EXCLUDE 백스톱 위반은 재시도 안내 대신 슬롯 선점 실패 메시지와 코드로 응답한다")
    void facilityBookingExclusionViolation_returnsSlotUnavailable() {
        java.sql.SQLException exclusionCause = new java.sql.SQLException(
                "conflicting key value violates exclusion constraint \"excl_facility_booking_active_overlap\"",
                "23P01");
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "could not execute statement", exclusionCause);

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().message()).isEqualTo("이미 예약된 시간이 포함되어 있어 신청할 수 없습니다.");
        assertThat(response.getBody().code()).isEqualTo("FACILITY_BOOKING_SLOT_UNAVAILABLE");
    }

    @Test
    @DisplayName("다른 EXCLUDE 위반이나 유니크 위반은 시설 예약 코드 없이 일반화된 메시지로 응답한다")
    void otherIntegrityViolation_staysGeneric() {
        java.sql.SQLException uniqueCause = new java.sql.SQLException(
                "duplicate key value violates unique constraint \"uk_recruitment_club_active\"", "23505");
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "could not execute statement", uniqueCause);

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().message()).isEqualTo("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.");
        assertThat(response.getBody().code()).isNull();
    }

    @Test
    @DisplayName("응답 메시지는 인덱스명·컬럼명 등 DB 내부 정보를 노출하지 않는다")
    void responseMessage_doesNotLeakDbInternals() {
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"uk_users_student_id_active\""
        );

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getBody()).isNotNull();
        String message = response.getBody().message();
        assertThat(message).doesNotContain("uk_users_student_id_active");
        assertThat(message).doesNotContain("constraint");
        assertThat(message).doesNotContain("duplicate key");
    }
}
