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
                new RuntimeException("duplicate key value violates unique constraint \"uk_users_email_active\"")
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
    @DisplayName("응답 메시지는 인덱스명·컬럼명 등 DB 내부 정보를 노출하지 않는다")
    void responseMessage_doesNotLeakDbInternals() {
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"uk_users_email_active\""
        );

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(exception);

        assertThat(response.getBody()).isNotNull();
        String message = response.getBody().message();
        assertThat(message).doesNotContain("uk_users_email_active");
        assertThat(message).doesNotContain("constraint");
        assertThat(message).doesNotContain("duplicate key");
    }
}
