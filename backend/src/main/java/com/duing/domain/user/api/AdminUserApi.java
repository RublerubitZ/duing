package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.ChangeUserStatusRequest;
import com.duing.domain.user.controller.dto.request.UpdateAdminNoteRequest;
import com.duing.domain.user.controller.dto.response.AdminUserDetailResponse;
import com.duing.domain.user.controller.dto.response.AdminUserSearchResponse;
import com.duing.domain.user.entity.UserStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "사용자(총동연)", description = "총동연 전용 회원 관리 API — 검색·상세 조회·강제 로그아웃·계정 상태 변경")
@SecurityRequirement(name = "BearerAuth")
public interface AdminUserApi {

    @Operation(summary = "사용자 검색 (ADMIN)",
            description = "회원 관리 목록과 동아리장 후보 검색이 함께 쓴다. q 는 선택 — 생략하면 전체를 대상으로 하고, "
                    + "studentId 는 prefix 일치, name 은 contains(case-insensitive) 일치. "
                    + "status 를 생략하면 상태를 가리지 않는다(= 전체). 기본 정렬은 최근 가입순.")
    @GetMapping("/admin/users")
    ResponseEntity<ApiResponse<PageResponse<AdminUserSearchResponse>>> searchUsers(
            @Parameter(description = "검색어 (학번 prefix 또는 이름 부분 일치). 생략 가능")
            @RequestParam(required = false) String q,
            @Parameter(description = "계정 상태 필터. 생략하면 전체", example = "SUSPENDED")
            @RequestParam(required = false) UserStatus status,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "회원 상세 조회 (ADMIN)",
            description = "기본 정보·가입 정보·휴대폰 인증 여부·가입 동아리·관리자 메모·최근 조치 이력을 한 번에 반환한다. "
                    + "휴대폰은 마스킹된 값만 담기며 원본은 별도 엔드포인트에서 감사 로그와 함께 조회한다. "
                    + "탈퇴한 회원은 404.")
    @GetMapping("/admin/users/{userId}")
    ResponseEntity<ApiResponse<AdminUserDetailResponse>> getUserDetail(
            @Parameter(description = "조회 대상 사용자 ID", required = true)
            @PathVariable Long userId
    );

    @Operation(summary = "사용자 강제 로그아웃 (ADMIN)",
            description = "대상 사용자의 token_version 을 올려 발급된 모든 액세스 토큰을 즉시 무효화하고, "
                    + "대상 사용자의 모든 세션·리프레시 토큰도 함께 폐기한다. "
                    + "토큰 탈취·기기 분실 대응용. 대상이 재로그인하기 전까지 모든 보호 API 에서 401 을 받는다.")
    @PostMapping("/admin/users/{userId}/force-logout")
    ResponseEntity<ApiResponse<Void>> forceLogout(
            @Parameter(description = "강제 로그아웃 대상 사용자 ID", required = true)
            @PathVariable Long userId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "계정 상태 변경 (ADMIN)",
            description = "ACTIVE ↔ SUSPENDED. 정지 시 대상의 모든 세션을 폐기하고 token_version 을 올려 "
                    + "발급된 액세스 토큰을 즉시 무효화한다. 사유는 정지·해제 모두 필수이며 감사 로그에 기록된다. "
                    + "현재 상태와 같으면 아무 동작도 하지 않고 204 를 반환한다(감사 로그도 남기지 않는다). "
                    + "자기 자신과 다른 ADMIN 계정은 정지할 수 없다 — 보호 정책은 무동작 판정보다 먼저 걸리므로 "
                    + "이미 정지된 ADMIN 계정에 정지를 다시 요청하면 204 가 아니라 400 이다.")
    @PatchMapping("/admin/users/{userId}/status")
    ResponseEntity<ApiResponse<Void>> changeUserStatus(
            @Parameter(description = "대상 사용자 ID", required = true) @PathVariable Long userId,
            @RequestBody @Valid ChangeUserStatusRequest changeUserStatusRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "관리자 메모 저장 (ADMIN)",
            description = "회원별 내부 메모를 저장한다. 사용자에게는 절대 노출되지 않는다. "
                    + "빈 문자열을 보내면 메모가 비워지며, 그 사실도 감사 로그에 기록된다. "
                    + "감사 로그에는 메모 본문을 저장하지 않는다.")
    @PutMapping("/admin/users/{userId}/admin-note")
    ResponseEntity<ApiResponse<Void>> updateAdminNote(
            @Parameter(description = "대상 사용자 ID", required = true) @PathVariable Long userId,
            @RequestBody @Valid UpdateAdminNoteRequest updateAdminNoteRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
