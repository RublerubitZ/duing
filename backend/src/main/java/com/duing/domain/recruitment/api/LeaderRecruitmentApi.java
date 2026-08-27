package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.request.CreateRecruitmentRequest;
import com.duing.domain.recruitment.controller.dto.request.UpdateRecruitmentRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
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

@Tag(name = "모집 공고(동아리장)", description = "동아리장 전용 모집 공고 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecruitmentApi {

    @Operation(summary = "모집 공고 생성", description = "본인이 운영진(LEADER/OFFICER)인 동아리에만 등록 가능. "
            + "단 targetRole=OFFICER(운영진 대상) 모집은 동아리장만 생성할 수 있다. "
            + "질문 목록을 함께 전송하면 RecruitmentForm 도 함께 생성된다.")
    @PostMapping("/leader/clubs/{clubId}/recruitments")
    ResponseEntity<ApiResponse<Long>> createRecruitment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "active 모집 교체",
            description = "현재 active 모집을 마감하고 같은 트랜잭션 안에서 새 모집을 생성한다. "
                    + "본인이 운영진(LEADER/OFFICER)인 동아리에서만 호출 가능하며, targetRole=OFFICER 모집은 동아리장 전용이다. "
                    + "기존 active 가 없으면 close 단계 없이 새 모집만 생성된다.")
    @PostMapping("/leader/clubs/{clubId}/recruitments/replace-active")
    ResponseEntity<ApiResponse<Long>> replaceActiveRecruitment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecruitmentRequest createRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "모집 공고 수정", description = "null 이 아닌 필드만 부분 갱신된다. applicationMode·externalFormUrl·targetRole 은 변경 불가. 이미 마감된 공고 수정 시 409 반환.")
    @PatchMapping("/leader/recruitments/{recruitmentId}")
    ResponseEntity<Void> updateRecruitment(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody UpdateRecruitmentRequest updateRecruitmentRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "모집 공고 수동 마감", description = "OPEN 상태의 모집 공고를 즉시 마감한다. 이미 마감된 공고에 호출하면 409 반환.")
    @PatchMapping("/leader/recruitments/{recruitmentId}/close")
    ResponseEntity<Void> closeRecruitment(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "상시모집 접수 마감", description = "상시모집(endDate 없음)의 종료일을 어제로 확정해 신규 지원 접수만 즉시 중단한다. "
            + "status 는 OPEN 을 유지하므로 기존 지원자 심사·면접은 계속 가능하다. 상시모집이 아니면 400, "
            + "시작일이 지나지 않았으면(당일 포함) 400 — 시작일 다음 날부터 가능, 이미 마감(CLOSED)된 공고면 409 반환. 운영진(LEADER/OFFICER) 권한 필요.")
    @PatchMapping("/leader/recruitments/{recruitmentId}/stop-intake")
    ResponseEntity<Void> stopRecruitmentIntake(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "모집 공고 삭제", description = "지원자가 없는 모집 공고만 삭제할 수 있다. 지원자가 1명이라도 있으면 409 — 진행 중 공고는 마감을 사용한다."
            + " 처리되지 않은 가입 요청이 남아 있어도 409 이며, 삭제되는 모집의 활성 가입 링크는 같은 트랜잭션에서 폐기된다. 운영진(LEADER/OFFICER) 권한 필요.")
    @DeleteMapping("/leader/recruitments/{recruitmentId}")
    ResponseEntity<Void> deleteRecruitment(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
}
