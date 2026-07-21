package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;

/**
 * 총동연(ADMIN) 동아리원 명단 조회 결과 행. 학교 제출 문서에 명단을 옮겨 쓰기 위한 용도라
 * 이름·학번·전공·단과대를 함께 내려준다. 리더용 {@code ClubMemberQuery} 와 달리 college 를 포함하고,
 * 전화번호는 담지 않는다(명단 붙여넣기에 불필요).
 */
public record AdminClubMemberQuery(
        Long memberId,
        String name,
        String studentId,
        String major,
        College college,
        Grade grade,
        ClubMemberRole role
) {
    public static AdminClubMemberQuery from(ClubMember clubMember) {
        return new AdminClubMemberQuery(
                clubMember.getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getUser().getMajor(),
                clubMember.getUser().getCollege(),
                clubMember.getUser().getGrade(),
                clubMember.getRole()
        );
    }
}
