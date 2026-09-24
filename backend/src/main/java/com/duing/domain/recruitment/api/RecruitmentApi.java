package com.duing.domain.recruitment.api;

import com.duing.domain.recruitment.controller.dto.response.RecruitmentDetailResponse;
import com.duing.domain.recruitment.controller.dto.response.RecruitmentSummaryResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "모집 공고", description = "모집 공고 탐색 (공개)")
public interface RecruitmentApi {

    @Operation(summary = "모집 달력 조회",
            description = "조회 창과 기간이 겹치는 모집 공고를 시작일순으로 반환한다. "
                    + "창은 yearMonth(yyyy-MM, 그 달 전체) 또는 from·to(yyyy-MM-dd, 양끝 포함) 중 하나로만 지정한다. "
                    + "둘 다 주거나 둘 다 없거나 from·to 중 하나만 주면 400. from 이 to 보다 늦거나 창이 92일을 넘어도 400.")
    @GetMapping("/recruitments")
    ResponseEntity<ApiResponse<List<RecruitmentSummaryResponse>>> getCalendar(
            @Parameter(description = "조회 연월 (예: 2026-05) — from·to 와 함께 쓸 수 없다", example = "2026-05")
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth,
            @Parameter(description = "조회 시작일 (예: 2026-05-20) — to 와 함께 지정", example = "2026-05-20")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (예: 2026-06-19) — from 과 함께 지정", example = "2026-06-19")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    );

    @Operation(summary = "모집 공고 상세 조회",
            description = "지원서 질문을 두 형태로 함께 반환한다. questions 는 질문 텍스트 배열(legacy)이고, "
                    + "questionItems 는 유형·필수 여부·선택지를 담은 구조화 질문이다. "
                    + "지원 제출(answerItems)에 실을 questionId 와 choiceId 는 questionItems 에서만 얻을 수 있다.")
    @GetMapping("/recruitments/{recruitmentId}")
    ResponseEntity<ApiResponse<RecruitmentDetailResponse>> getRecruitment(@PathVariable Long recruitmentId);
}
