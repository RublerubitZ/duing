package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;

/**
 * ADMIN 사용자 검색 결과 행. 비밀번호 해시·전화번호 등 민감 필드는 노출하지 않는다.
 *
 * <p>학년·단과대·전공은 동명이인 식별용이다 — 운영진이 검색 결과에서 엉뚱한 회원을 고르지 않도록
 * 이름·학번만으로 구분되지 않을 때의 추가 단서를 제공한다. grade·college 는 원값(enum)으로 내려주고
 * 한글 라벨은 프론트가 기존 표시명 맵으로 붙인다.
 */
public record UserSearchResultQuery(
        Long id,
        String studentId,
        String name,
        UserRole role,
        Grade grade,
        College college,
        String major
) {
    public static UserSearchResultQuery from(User user) {
        return new UserSearchResultQuery(
                user.getId(),
                user.getStudentId(),
                user.getName(),
                user.getRole(),
                user.getGrade(),
                user.getCollege(),
                user.getMajor()
        );
    }
}
