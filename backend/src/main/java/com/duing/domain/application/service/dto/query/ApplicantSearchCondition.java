package com.duing.domain.application.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.user.entity.College;
import java.time.LocalDate;

/**
 * 운영진 지원자 목록 검색 조건. 모든 필드 옵셔널.
 * - submittedFrom / submittedTo: LocalDate. half-open 변환은 Repository 가 담당.
 * - q: 이름·학번·major 부분일치(OR), 대소문자 무시.
 */
public record ApplicantSearchCondition(
        ApplicationStatus status,
        College college,
        String q,
        LocalDate submittedFrom,
        LocalDate submittedTo
) {
    public ApplicantSearchCondition {
        if (submittedFrom != null && submittedTo != null && submittedFrom.isAfter(submittedTo)) {
            throw new ApplicationDomainException.InvalidDateRangeException();
        }
    }
}
