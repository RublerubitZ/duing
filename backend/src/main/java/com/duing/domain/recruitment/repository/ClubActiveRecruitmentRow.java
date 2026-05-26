package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.LocalDate;

/**
 * 동아리 id 묶음에 대한 대표 모집 1건 lookup row.
 * displayStatus 는 서비스 단에서 today 와 함께 계산한다.
 */
public record ClubActiveRecruitmentRow(
        Long clubId,
        Long recruitmentId,
        RecruitmentStatus status,
        LocalDate startDate,
        LocalDate endDate
) {}