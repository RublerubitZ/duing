package com.duing.global.exception;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.global.auth.JwtAccessDeniedHandler;
import com.duing.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.apache.catalina.connector.ClientAbortException;
import org.hibernate.query.sqm.PathElementException;
import org.hibernate.query.sqm.produce.function.FunctionArgumentException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.util.UriUtils;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

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

    /**
     * Spring Security AccessDeniedException 의 예외 메시지는 응답에 싣지 않는다 — 의도적 소거(정책 확정: 2026-08-18).
     * "회장만 가능" 류의 구체 사유는 권한 구조·리소스 존재를 알려주는 열거 힌트가 될 수 있어, 이 경로의
     * 403 은 전부 무정보 고정 문구로 통일한다(URL 레이어 백스톱 JwtAccessDeniedHandler 와 동일 문구·단일 상수).
     * 사용자 안내가 필요한 403 은 ApplicationException 계열 도메인 예외로 던질 것 — 그 경로는 메시지가 노출된다.
     * 원 메시지는 서버 디버깅용 debug 로그로만 남긴다.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException exception) {
        log.debug("접근 거부(사유는 응답에 미노출): {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error(JwtAccessDeniedHandler.ACCESS_DENIED_MESSAGE));
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

    /**
     * 멀티파트 본문을 해석할 수 없는 경우(종료 boundary 누락·boundary 파라미터 누락 등). 브라우저가 만들지 않는
     * 형태라 클라이언트 입력 오류로 보고, catch-all 의 500 + Sentry ERROR 대신 400 으로 응답한다. 크기 초과
     * (MaxUploadSizeExceededException)도 이 타입의 하위지만 Spring 이 더 구체적인 위 핸들러를 고르므로 413 은 그대로다.
     * 업로드 도중 클라이언트가 끊긴 경우(원인에 ClientAbortException)는 Tomcat 이 이미 400/408 로 전환해 응답 본문이
     * 버려지므로, 연결 종료 정책과 같게 응답을 쓰지 않고 debug 로만 남긴다(끊길 때마다 WARN 이 쌓이지 않게). 임시 디스크
     * 부족 같은 서버측 원인도 여기로 오므로 원인 예외의 타입과 메시지를 warn 으로 남긴다 — 이 로그가 유일한 단서다.
     */
    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMalformedMultipart(MultipartException exception) {
        if (hasCause(exception, ClientAbortException.class)) {
            handleClientDisconnect(exception);
            return null; // 응답 미기록 — void 핸들러(handleClientDisconnect)와 같은 효과
        }
        log.warn("멀티파트 본문 해석 실패 (400 변환): {}", NestedExceptionUtils.getMostSpecificCause(exception).toString());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("업로드 요청 형식이 올바르지 않습니다."));
    }

    // 아래 4종은 Spring MVC 표준 요청 오류(필수 파라미터·요청 항목 누락, 미지원 메서드·미디어 타입)로,
    // 모두 클라이언트 요청 형식 오류다. 명시적 핸들러가 없으면 catch-all(handleUnexpected) 로 흘러가
    // 500 + ERROR 로그 + Sentry 이벤트로 잘못 승격되므로, 각각 올바른 4xx 와 한국어 안내로 응답한다.
    // 정상 클라이언트의 입력 실수 성격이 강한 400(파라미터·항목 누락)은 무로그로 두어 알림 노이즈를 막고,
    // 엔드포인트는 있으나 잘못 호출한 405·415 는 404(handleNoResourceFound)와 같은 취지로 debug 로 남긴다.

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParameter(
            MissingServletRequestParameterException exception) {
        String message = String.format("필수 요청 파라미터 '%s' 가 없습니다.", exception.getParameterName());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingPart(
            MissingServletRequestPartException exception) {
        String message = String.format("필수 요청 항목 '%s' 가 없습니다.", exception.getRequestPartName());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(message));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException exception) {
        log.debug("지원하지 않는 요청 메서드: {}", exception.getMethod());
        String message = String.format("지원하지 않는 요청 메서드입니다: %s", exception.getMethod());
        // RFC 9110 §15.5.6 — 405 는 Allow 헤더를 반드시 포함해야 한다. 예외가 지원 메서드로 채워둔
        // 헤더(Allow)를 그대로 실어 보낸다.
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .headers(exception.getHeaders())
                .body(ApiResponse.error(message));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMediaTypeNotSupported(
            HttpMediaTypeNotSupportedException exception) {
        log.debug("지원하지 않는 미디어 타입: {}", exception.getContentType());
        // 예외가 지원 미디어 타입으로 채워둔 헤더(Accept 등)를 함께 실어 클라이언트가 재시도 시 참고하게 한다.
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .headers(exception.getHeaders())
                .body(ApiResponse.error("지원하지 않는 미디어 타입입니다."));
    }

    /**
     * 정렬(sort) 파라미터가 존재하지 않는 속성을 가리키는 경우. Spring Data 가 정렬 속성을 엔티티에
     * 매핑하지 못하면 던지며(파생 쿼리·QueryDSL 은 직접, JPQL @Query 는 InvalidDataAccessApiUsage 로 래핑),
     * 핸들러가 없으면 catch-all 로 500 이 된다. 단, <b>요청이 실제로 sort 파라미터를 넘겼을 때만</b>
     * 클라이언트 입력 오류(400)로 본다 — sort 없이 이 예외가 나면 정적 쿼리의 스키마 드리프트·엔티티
     * 리네임 같은 서버측 회귀이므로 500 + 스택트레이스로 알린다(관측성 유지).
     */
    @ExceptionHandler(PropertyReferenceException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidSortProperty(
            PropertyReferenceException exception, HttpServletRequest request) {
        return invalidSortOrServerError(exception, request);
    }

    @ExceptionHandler(InvalidDataAccessApiUsageException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidDataAccessApiUsage(
            InvalidDataAccessApiUsageException exception, HttpServletRequest request) {
        // 존재하지 않는 정렬 속성이 쿼리에 적용되면, 파생 쿼리는 PropertyReferenceException, JPQL @Query 는
        // Hibernate PathElementException 이 이 예외로 래핑되어 올라온다.
        if (hasCause(exception, PropertyReferenceException.class)
                || hasCause(exception, PathElementException.class)) {
            return invalidSortOrServerError(exception, request);
        }
        // 문자열이 아닌 속성에 대소문자 무시 정렬(sort=속성,ignorecase)을 걸면 JPQL @Query 는 lower(...) 인자 타입
        // 오류(FunctionArgumentException)로 올라온다. 클라이언트 sort 가 lower() 를 만드는 경로는 ignorecase 뿐이라
        // 그 토큰이 있을 때만 400 으로 본다 — sort 를 정렬 enum 으로 쓰는 목록의 서버측 lower() 버그는 500 으로 남긴다.
        if (hasCause(exception, FunctionArgumentException.class) && hasIgnoreCaseSort(request)) {
            return invalidSortOrServerError(exception, request);
        }
        log.error("Invalid data access API usage", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 오류가 발생했습니다."));
    }

    /**
     * 경로/속성 해석 실패를 클라이언트 정렬 오류(400)와 서버측 쿼리 회귀(500)로 가른다. 요청이 sort
     * 파라미터를 실제로 넘겼을 때만 400 — 그렇지 않으면 정적 쿼리가 깨진 서버 문제이므로 500 + 스택트레이스로
     * 남겨 알림에서 숨지 않게 한다.
     */
    private ResponseEntity<ApiResponse<Void>> invalidSortOrServerError(
            Throwable exception, HttpServletRequest request) {
        if (request.getParameter("sort") != null) {
            log.warn("잘못된 정렬 속성 (400 변환): {}", rootCauseMessage(exception));
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("지원하지 않는 정렬 조건입니다."));
        }
        log.error("정렬 파라미터 없이 발생한 쿼리 경로 오류 — 서버측 회귀로 간주(500)", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 오류가 발생했습니다."));
    }

    private boolean hasIgnoreCaseSort(HttpServletRequest request) {
        String[] sortValues = request.getParameterValues("sort");
        return sortValues != null && Arrays.stream(sortValues)
                .anyMatch(sortValue -> sortValue.toLowerCase(Locale.ROOT).contains("ignorecase"));
    }

    /**
     * 정렬(sort) 값을 Spring Data 가 한 번 더 디코딩하다 실패한 경우. 정렬 리졸버는 서블릿이 이미 디코딩한 값을
     * UriUtils.decode 로 다시 디코딩하므로, '%' 뒤에 16진수 두 자리가 오지 않는 값(예: 요청상 x%25 → x%)이면
     * 핸들러 실행 전에 IllegalArgumentException 이 난다. 같은 디코딩이 실패하는 요청만 400 으로 바꾸고, 그 밖의
     * IllegalArgumentException 은 서버측 결함이므로 catch-all 과 같이 500 + 스택트레이스로 남긴다.
     * 디코딩 오류 메시지에는 입력이 그대로 실려 로그 줄을 위조할 수 있으므로 남기지 않는다.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(
            IllegalArgumentException exception, HttpServletRequest request) {
        if (hasUndecodableSort(request)) {
            log.warn("정렬 값 재디코딩 실패 (400 변환)");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("지원하지 않는 정렬 조건입니다."));
        }
        return handleUnexpected(exception);
    }

    private boolean hasUndecodableSort(HttpServletRequest request) {
        String[] sortValues = request.getParameterValues("sort");
        if (sortValues == null) {
            return false;
        }
        for (String sortValue : sortValues) {
            try {
                UriUtils.decode(sortValue, StandardCharsets.UTF_8);
            } catch (IllegalArgumentException decodeFailure) {
                return true;
            }
        }
        return false;
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
        if (isFacilityBookingOverlapViolation(exception)) {
            // 시설 예약 EXCLUDE 백스톱(excl_facility_booking_active_overlap) 발화 — 겹침은 재시도로
            // 해소되지 않는 영구 조건이라 일반 재시도 안내 대신 주 경로(SlotUnavailableException)와 동일한
            // 메시지·코드로 응답해 FE 분기를 살린다(2026-07-17 감사). 백스톱 발화 자체는 잠금 직렬화를
            // 우회한 신호이므로 warn 으로 남긴다.
            log.warn("시설 예약 EXCLUDE 백스톱 발화 (409 변환): {}", rootCauseMessage(exception));
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.error(FacilityBookingException.SlotUnavailableException.MESSAGE,
                            FacilityBookingException.SlotUnavailableException.CODE));
        }
        // error 승격(2026-07-17 감사 제안) — 정상 사용자 경합 경로(찜·가입·번호변경·클럽 이름·FAQ 카테고리)가
        // 전부 도메인 로컬 catch 로 분류되면서, 여기 도달하는 위반은 분류되지 않은 새 제약 경합뿐이다.
        // 새 unique/CHECK/FK 를 추가할 때는 해당 도메인에 로컬 catch 를 함께 정비한다.
        log.error("DB 제약 위반 발생 (409 변환): {}", rootCauseMessage(exception));
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error("요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요."));
    }

    /**
     * 시설 예약 활성 겹침 EXCLUDE 위반인지만 true — 다른 EXCLUDE/UNIQUE/FK/CHECK 위반은 false 로
     * 일반 처리에 맡긴다. Hibernate 의 getConstraintName 이 23P01 에서 null 일 수 있어 모집 도메인
     * 전례(SQLState + 제약명 메시지 매칭)를 따른다.
     */
    private static boolean isFacilityBookingOverlapViolation(DataIntegrityViolationException exception) {
        return PostgresConstraintViolations.isExclusionViolationOf(
                exception, FacilityBookingException.SlotUnavailableException.ACTIVE_OVERLAP_CONSTRAINT);
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

    private boolean hasCause(Throwable throwable, Class<? extends Throwable> causeType) {
        Throwable cause = throwable;
        while (cause != null) {
            if (causeType.isInstance(cause)) {
                return true;
            }
            if (cause.getCause() == cause) {
                break;
            }
            cause = cause.getCause();
        }
        return false;
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
