package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.ManagedClubResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "동아리(운영진)", description = "동아리장·운영진 전용 동아리 조회 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderClubApi {

    @Operation(
            summary = "내가 운영 가능한 동아리 목록 조회",
            description = "현재 사용자가 LEADER 또는 OFFICER 로 활동 중인 ACTIVE 동아리 목록과 각 동아리의 진행 중 모집 수를 반환한다. 운영 콘솔 진입 시 셀렉터·가드 판정에 사용된다."
    )
    @GetMapping("/leader/clubs/me/managed")
    ResponseEntity<ApiResponse<List<ManagedClubResponse>>> getManagedClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}