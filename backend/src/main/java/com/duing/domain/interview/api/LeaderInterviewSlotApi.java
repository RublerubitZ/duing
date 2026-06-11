package com.duing.domain.interview.api;

import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.UpdateInterviewSlotRequest;
import com.duing.domain.interview.controller.dto.response.CreateInterviewSlotsResponse;
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

@Tag(name = "면접 슬롯(운영진)", description = "운영진 전용 면접 슬롯 관리")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderInterviewSlotApi {

    @Operation(
            summary = "면접 슬롯 일괄 생성",
            description = "라운드에 슬롯을 일괄 등록한다 — wizard Step3 및 dashboard 의 [추가 슬롯 생성]. "
                    + "준비 중(DRAFT)·응답 수집 중(COLLECTING) 라운드에서만 가능. "
                    + "응답 수집 중 && 마감 전이면 '가능 슬롯 없음' 으로 응답했던 멤버가 INVITED 로 복귀하고 재알림이 발송된다 (Rule 2). "
                    + "마감이 지났다면 마감 연장이 먼저다 — 복귀·알림은 발동하지 않는다."
    )
    @PostMapping("/leader/interview-rounds/{roundId}/slots")
    ResponseEntity<ApiResponse<CreateInterviewSlotsResponse>> createSlots(
            @PathVariable Long roundId,
            @Valid @RequestBody CreateInterviewSlotsRequest createInterviewSlotsRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 슬롯 수정",
            description = "시간(start/end 쌍)·정원을 부분 수정한다. 지원자가 선택한 슬롯은 정원만 변경 가능. "
                    + "DRAFT·COLLECTING 라운드에서만 가능."
    )
    @PatchMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest updateInterviewSlotRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 슬롯 삭제",
            description = "슬롯을 삭제한다(soft delete). 지원자가 선택한 슬롯은 삭제 불가. DRAFT·COLLECTING 라운드에서만 가능."
    )
    @DeleteMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
