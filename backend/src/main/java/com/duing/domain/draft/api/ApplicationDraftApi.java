package com.duing.domain.draft.api;

import com.duing.domain.draft.controller.dto.request.UpsertDraftRequest;
import com.duing.domain.draft.controller.dto.response.DraftResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "임시저장", description = "지원서 임시저장 API")
@SecurityRequirement(name = "BearerAuth")
public interface ApplicationDraftApi {

    @Operation(summary = "임시저장 조회", description = "현재 로그인 사용자의 해당 모집에 대한 임시저장 데이터를 조회한다. 없으면 exists=false 로 반환.")
    @GetMapping
    ResponseEntity<ApiResponse<DraftResponse>> get(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "임시저장 upsert (204)", description = "임시저장을 생성하거나 갱신한다. 마감된 모집이면 410 반환.")
    @PutMapping
    ResponseEntity<Void> upsert(
            @PathVariable Long recruitmentId,
            @RequestBody UpsertDraftRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "임시저장 삭제 (204, 멱등)", description = "임시저장을 삭제한다. 없어도 204 반환.")
    @DeleteMapping
    ResponseEntity<Void> delete(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}