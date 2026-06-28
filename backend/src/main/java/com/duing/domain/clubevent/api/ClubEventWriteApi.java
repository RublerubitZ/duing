package com.duing.domain.clubevent.api;

import com.duing.domain.clubevent.controller.dto.request.CreateClubEventRequest;
import com.duing.domain.clubevent.controller.dto.request.UpdateClubEventRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "동아리 일정 (작성/관리)")
@SecurityRequirement(name = "BearerAuth")
public interface ClubEventWriteApi {

    @Operation(summary = "동아리 일정 생성 (LEADER/OFFICER)")
    @PostMapping("/clubs/{clubId}/events")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 수정 (LEADER/OFFICER)")
    @PatchMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Valid @RequestBody UpdateClubEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 삭제 (LEADER/OFFICER)")
    @DeleteMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
