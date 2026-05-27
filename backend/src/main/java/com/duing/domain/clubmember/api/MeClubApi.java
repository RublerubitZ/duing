package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.MyClubResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "마이페이지", description = "사용자 본인 관점의 동아리·지원 조회 API")
@SecurityRequirement(name = "BearerAuth")
public interface MeClubApi {

    @Operation(
            summary = "내가 가입한 동아리 목록 조회",
            description = "현재 사용자가 LEADER / OFFICER / MEMBER 중 어떤 역할로든 소속된 동아리를 가입일(최신) 순으로 반환한다. " +
                    "운영자용 /leader/clubs/me/managed 와는 별개이며, 마이페이지 '가입한 동아리' 섹션에서 사용한다."
    )
    @GetMapping("/me/clubs")
    ResponseEntity<ApiResponse<List<MyClubResponse>>> getMyClubs(
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
