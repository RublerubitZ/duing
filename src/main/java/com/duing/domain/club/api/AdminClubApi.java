package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubStatusRequest;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "동아리(총동연)", description = "총동연 전용 동아리 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminClubApi {

    @Operation(summary = "동아리 생성", description = "총동연이 신규 동아리를 등록한다. 기본 상태는 PENDING_APPROVAL.")
    @PostMapping("/admin/clubs")
    ResponseEntity<ApiResponse<Long>> createClub(@Valid @RequestBody CreateClubRequest createClubRequest);

    @Operation(summary = "동아리 상태 변경", description = "운영 상태(ACTIVE/INACTIVE/PENDING_APPROVAL)를 변경한다.")
    @PatchMapping("/admin/clubs/{clubId}/status")
    ResponseEntity<ApiResponse<Void>> updateClubStatus(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubStatusRequest updateClubStatusRequest
    );
}
