package com.duing.global.exception;

import com.duing.domain.interview.controller.dto.response.UnresolvedMembersResponse;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.response.ApiResponse;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.apache.catalina.connector.ClientAbortException;
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
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
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

    /**
     * 멀티파트 업로드가 서블릿 한도(spring.servlet.multipart.max-*-size, 10MB)를 초과한 경우.
     * catch-all 로 흘러가면 500 + Sentry ERROR 로 잘못 승격되므로, 클라이언트 입력 오류인 413 으로 응답한다.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleMaxUploadSize(MaxUploadSizeExceededException exception) {
        log.warn("업로드 크기 초과 (413 변환): {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.error("업로드 가능한 최대 크기를 초과했습니다."));
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

    /**
     * 클라이언트가 응답 수신 전에 연결을 끊은 경우(브라우저 타임아웃·요청 취소·탭 이탈).
     * 서버 오류가 아니므로 ERROR/Sentry 노이즈를 만들지 않고, 죽은 소켓에 응답 재작성도 시도하지 않는다(void).
     */
    @ExceptionHandler({AsyncRequestNotUsableException.class, ClientAbortException.class})
    public void handleClientDisconnect(Exception exception) {
        log.debug("클라이언트 연결 종료로 응답 미전송: {}", exception.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception exception) {
        log.error("Unhandled exception", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 오류가 발생했습니다."));
    }
}
