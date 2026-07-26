package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "관리자 회원 검색 결과 행")
public record AdminUserSearchResponse(
        Long id,
        String studentId,
        String name,
        UserRole role,
        @Schema(description = "학년(원값). 한글 라벨은 프론트가 붙인다.", example = "JUNIOR")
        Grade grade,
        @Schema(description = "단과대(원값). 한글 라벨은 프론트가 붙인다.", example = "IT_ENGINEERING")
        College college,
        @Schema(description = "전공(자유 입력). 미입력이면 빈 문자열일 수 있다.", example = "컴퓨터공학")
        String major,
        @Schema(description = "계정 상태(원값). ACTIVE 는 정상, SUSPENDED 는 로그인·API 접근이 차단된 이용 정지 상태다. 항상 값이 있다.",
                example = "ACTIVE")
        UserStatus status
) {
    public static AdminUserSearchResponse from(UserSearchResultQuery searchResult) {
        return new AdminUserSearchResponse(
                searchResult.id(),
                searchResult.studentId(),
                searchResult.name(),
                searchResult.role(),
                searchResult.grade(),
                searchResult.college(),
                searchResult.major(),
                searchResult.status()
        );
    }
}
