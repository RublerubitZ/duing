package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.AdminClubMemberResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 멤버(총동연)", description = "총동연 전용 동아리원 명단 조회")
@SecurityRequirement(name = "bearerAuth")
public interface AdminClubMemberApi {

    @Operation(summary = "동아리원 명단 조회(ADMIN)",
            description = "학교 제출 문서용 명단. 이름·학번·전공·단과대를 함께 내려준다. "
                    + "LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순. 동아리 소속 여부와 무관하게 조회 가능.")
    @GetMapping("/admin/clubs/{clubId}/members")
    ResponseEntity<ApiResponse<List<AdminClubMemberResponse>>> getClubMembers(@PathVariable Long clubId);
}
