package com.duing.global.exception;

import com.duing.domain.interview.controller.dto.response.UnresolvedMembersResponse;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.response.ApiResponse;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(InterviewException.RoundHasUnresolvedMembers.class)
    public ResponseEntity<ApiResponse<UnresolvedMembersResponse>> handleUnresolvedMembers(
            InterviewException.RoundHasUnresolvedMembers exception) {
        // §6.3 — 경고 2종을 데이터로 실어 FE 가 분리 렌더·강조할 수 있게 한다.
        log.warn("RoundHasUnresolvedMembers: unresponded={}, respondedUnassigned={}",
                exception.getPayload().unresponded().size(),
                exception.getPayload().respondedUnassigned().size());
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(false, UnresolvedMembersResponse.from(exception.getPayload()),
                        exception.getMessage(), null));
    }

    @ExceptionHandler(ApplicationException.class)
    public ResponseEntity<ApiResponse<Void>> handleApplicationException(ApplicationException exception) {
        log.warn("ApplicationException: {}", exception.getMessage());
        return ResponseEntity.status(exception.getStatus())
                .body(ApiResponse.error(exception.getMessage(), exception.getCode()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        String parameterName = exception.getName();
        String message = String.format("요청 파라미터 '%s' 의 형식이 올바르지 않습니다.", parameterName);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthentication(AuthenticationException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error("인증이 필요합니다."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("권한이 없습니다."));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotReadable(HttpMessageNotReadableException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("요청 본문을 해석할 수 없습니다."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFound(NoResourceFoundException exception) {
        log.warn("NoResourceFoundException: {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("요청하신 경로를 찾을 수 없습니다."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDataIntegrityViolation(
            DataIntegrityViolationException exception) {
        log.warn("DB 제약 위반 발생 (409 변환): {}", rootCauseMessage(exception));
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요."));
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handlePessimisticLocking(
            PessimisticLockingFailureException exception) {
        log.warn("비관적 잠금 획득 실패 (409 변환): {}", rootCauseMessage(exception));
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요."));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> handleOptimisticLocking(
            ObjectOptimisticLockingFailureException exception) {
        log.warn("낙관적 잠금 충돌 (409 변환): {}", rootCauseMessage(exception));
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요."));
    }

    private String rootCauseMessage(Throwable throwable) {
        Throwable cause = throwable;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        return cause.getMessage();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception exception) {
        log.error("Unhandled exception", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 오류가 발생했습니다."));
    }
}
