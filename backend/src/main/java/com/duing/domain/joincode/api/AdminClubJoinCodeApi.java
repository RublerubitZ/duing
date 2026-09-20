package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.request.ForceRevokeJoinCodeRequest;
import com.duing.domain.joincode.controller.dto.response.AdminClubJoinCodeResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "가입 링크(총동연)",
        description = "총동연 전용 동아리 가입 링크 관리 API — 링크 2종(모집 가입 링크·부원 초대) 전체 조회·강제 폐기")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubJoinCodeApi {

    @Operation(summary = "동아리 가입 링크 목록 조회 (ADMIN)",
            description = "동아리가 만든 가입 링크를 종류 구분 없이 한 목록으로, 발급 최신순으로 반환한다. "
                    + "운영진 화면과 달리 폐기·만료·소진된 링크까지 전부 포함한다 — 총동연이 보는 것은 "
                    + "현재 쓸 수 있는 링크가 아니라 이 동아리가 만든 링크의 이력이다. 페이지네이션은 제공하지 않는다. "
                    + "linkType 이 RECRUITMENT 면 모집 가입 링크(recruitmentId·recruitmentTitle 이 실린다), "
                    + "CLUB_INVITE 면 부원 초대 링크(inviteExpiresAt·autoApprove 가 실린다)다. "
                    + "status 는 REVOKED > EXHAUSTED > EXPIRED > ACTIVE 우선순위로 서버가 판정한 값이며, "
                    + "joinExpiresAt 은 모집이 진행 중이라 기한이 아직 정해지지 않았으면 비어 있다. "
                    + "createdByName·revokedByName·recruitmentTitle 은 대상이 탈퇴·삭제됐으면 비어 나온다. "
                    + "활동 이력과 같이 폐쇄된 동아리의 링크도 조회된다 — 폐쇄 뒤에도 감사 열람은 열려 있어야 한다. "
                    + "폐쇄가 활성 링크를 함께 폐기하므로 그 링크들은 REVOKED 로 실리며, 없는 동아리는 빈 목록이다.")
    @GetMapping("/admin/clubs/{clubId}/join-codes")
    ResponseEntity<ApiResponse<List<AdminClubJoinCodeResponse>>> getJoinCodes(
            @Parameter(description = "조회 대상 동아리 ID", required = true)
            @PathVariable Long clubId
    );

    @Operation(summary = "가입 링크 강제 폐기 (ADMIN)",
            description = "동아리의 가입 링크를 총동연 권한으로 폐기한다. 모집 가입 링크·부원 초대 둘 다 대상이며, "
                    + "운영진 수동 폐기와 같은 전이를 타므로 폐기 시각·폐기자가 남고 그 링크로는 더 이상 가입 신청을 받을 수 없다. "
                    + "이미 접수된 가입 요청은 그대로 남아 운영진이 계속 처리할 수 있다. "
                    + "사유는 필수(최대 500자)이며 활동 이력에만 남고 동아리에 통보되지 않는다. "
                    + "이미 폐기된 링크에 다시 호출해도 최초 폐기 시각을 덮어쓰지 않고 성공으로 응답한다(멱등). "
                    + "다른 동아리의 링크이거나 없는 링크면 404.")
    @PatchMapping("/admin/clubs/{clubId}/join-codes/{joinCodeId}/revoke")
    ResponseEntity<ApiResponse<Void>> forceRevokeJoinCode(
            @Parameter(description = "링크가 속한 동아리 ID", required = true)
            @PathVariable Long clubId,
            @Parameter(description = "폐기할 가입 링크 ID", required = true)
            @PathVariable Long joinCodeId,
            @Valid @RequestBody ForceRevokeJoinCodeRequest forceRevokeJoinCodeRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
