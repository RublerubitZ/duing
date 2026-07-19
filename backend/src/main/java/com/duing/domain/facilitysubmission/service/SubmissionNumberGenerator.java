package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionSequence;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 제출번호 채번(스펙 §3) — SUB-YYYYMMDD-NNN. 일자별 시퀀스 행을 FOR UPDATE 로 잠가 직렬화하고,
 * submission_no UNIQUE 제약이 최종 백스톱이다.
 * 호출자는 쓰기 트랜잭션 안에서 호출해야 한다 — 행잠금이 트랜잭션 커밋까지 유지된다.
 */
@Component
@RequiredArgsConstructor
public class SubmissionNumberGenerator {

    private static final DateTimeFormatter DATE_PART = DateTimeFormatter.BASIC_ISO_DATE;

    private final FacilitySubmissionSequenceRepository sequenceRepository;

    public String nextNumber(LocalDate submissionDate) {
        sequenceRepository.insertIfAbsent(submissionDate);
        FacilitySubmissionSequence sequence = sequenceRepository.findBySeqDateForUpdate(submissionDate)
                .orElseThrow(() -> new IllegalStateException("채번 행이 존재해야 합니다: " + submissionDate));
        return "SUB-%s-%03d".formatted(submissionDate.format(DATE_PART), sequence.currentAndIncrement());
    }
}
