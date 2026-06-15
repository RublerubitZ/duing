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
            description = "라운드에 슬롯을 일괄 등록한다 — wizard Step3·dashboard [추가 슬롯 생성]·확정 후 운영진 재조정. "
                    + "준비 중(DRAFT)·응답 수집 중(COLLECTING)·확정(SCHEDULED) 라운드에서 가능. "
                    + "COLLECTING && 마감 전이면 '가능 슬롯 없음' 멤버가 INVITED 로 복귀하고 재알림이 발송된다 (Rule 2). "
                    + "마감이 지났거나 SCHEDULED 이면 복귀·알림은 발동하지 않는다 (수집 종료·§6.4)."
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
                    + "DRAFT·COLLECTING·SCHEDULED 라운드에서 가능 (§6.4 확정 후 재조정). "
                    + "SCHEDULED 에서 정원을 줄일 때 기존 배정 수보다 적으면 409."
    )
    @PatchMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> updateSlot(
            @PathVariable Long slotId,
            @Valid @RequestBody UpdateInterviewSlotRequest updateInterviewSlotRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(
            summary = "면접 슬롯 삭제",
            description = "슬롯을 삭제한다(soft delete). 지원자가 선택한 슬롯은 삭제 불가. "
                    + "DRAFT·COLLECTING·SCHEDULED 라운드에서 가능 (§6.4 확정 후 재조정)."
    )
    @DeleteMapping("/leader/interview-slots/{slotId}")
    ResponseEntity<ApiResponse<Void>> deleteSlot(
            @PathVariable Long slotId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
