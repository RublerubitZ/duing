package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.AdminClubMemberQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "총동연 동아리원 명단 행(학교 제출용)")
public record AdminClubMemberResponse(
        Long memberId,
        String name,
        String studentId,
        @Schema(description = "전공(자유 입력). 미설정이면 빈 문자열일 수 있다.", example = "컴퓨터공학")
        String major,
        @Schema(description = "단과대(원값). 한글 라벨은 프론트가 붙인다.", example = "IT_ENGINEERING")
        College college,
        @Schema(description = "학년(원값). 한글 라벨은 프론트가 붙인다.", example = "JUNIOR")
        Grade grade,
        ClubMemberRole role
) {
    public static AdminClubMemberResponse from(AdminClubMemberQuery query) {
        return new AdminClubMemberResponse(
                query.memberId(),
                query.name(),
                query.studentId(),
                query.major(),
                query.college(),
                query.grade(),
                query.role()
        );
    }
}
