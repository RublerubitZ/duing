package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.request.CreateRecruitmentRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "모집 공고(동아리장)", description = "동아리장 전용 모집 공고 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecruitmentApi {

    @Operation(summary = "모집 공고 생성", description = "본인이 동아리장인 동아리에만 등록 가능. 질문 목록을 함께 전송하면 RecruitmentForm 도 함께 생성된다.")
    @PostMapping("/leader/clubs/{clubId}/recruitments")
    ResponseEntity<ApiResponse<Long>> createRecruitment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}