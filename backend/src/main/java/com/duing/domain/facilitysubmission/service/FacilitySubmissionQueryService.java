package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchSearchCondition;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FacilitySubmissionQueryService {

    SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query);

    Page<SubmissionBatchListItem> getBatches(SubmissionBatchSearchCondition condition, Pageable pageable);

    /** 조회 감사(VIEWED)를 남기는 쓰기 동반 조회 — 구현은 readOnly 금지(스펙 §5.4). */
    SubmissionBatchDetailResult getDetail(Long batchId, SubmissionActorContext actor);
}
