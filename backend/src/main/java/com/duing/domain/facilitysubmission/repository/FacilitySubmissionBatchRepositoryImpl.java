package com.duing.domain.facilitysubmission.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.facilitysubmission.entity.QFacilitySubmissionBatch.facilitySubmissionBatch;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchSearchCondition;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchStatusFilter;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class FacilitySubmissionBatchRepositoryImpl implements FacilitySubmissionBatchRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    /** 제출 이력(§5.3) — 취소 포함, id 내림차순 = 생성 역순(결정적 정렬). */
    @Override
    public Page<FacilitySubmissionBatch> search(SubmissionBatchSearchCondition condition, Pageable pageable) {
        List<FacilitySubmissionBatch> content = queryFactory.selectFrom(facilitySubmissionBatch)
                .where(searchPredicates(condition))
                .orderBy(facilitySubmissionBatch.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();
        Long total = queryFactory.select(facilitySubmissionBatch.count())
                .from(facilitySubmissionBatch)
                .where(searchPredicates(condition))
                .fetchOne();
        return new PageImpl<>(content, pageable, total != null ? total : 0L);
    }

    /** 목록·카운트 쿼리 공용 검색 술어 — null 항목은 QueryDSL where 가 무시한다. */
    private BooleanExpression[] searchPredicates(SubmissionBatchSearchCondition condition) {
        return new BooleanExpression[] {
                statusMatches(condition.status()),
                keywordMatches(condition.q()),
                submittedOnOrAfter(condition.submittedFrom()),
                submittedBefore(condition.submittedTo())
        };
    }

    /**
     * 파생 상태 필터(개편 스펙 A3) — 취소 > 완료 > 제출 대기 우선순위를 술어로 인코딩한다.
     * 엔티티 가드가 취소·완료 동시 성립을 막지만, COMPLETED 에 cancelledAt IS NULL 을 함께 걸어
     * FE deriveBatchStatus(취소 우선 표기)와 분류가 어긋날 여지를 없앤다.
     */
    private BooleanExpression statusMatches(SubmissionBatchStatusFilter status) {
        if (status == null) {
            return null;
        }
        return switch (status) {
            case REVIEWING -> facilitySubmissionBatch.cancelledAt.isNull()
                    .and(facilitySubmissionBatch.completedAt.isNull());
            case COMPLETED -> facilitySubmissionBatch.completedAt.isNotNull()
                    .and(facilitySubmissionBatch.cancelledAt.isNull());
            case CANCELLED -> facilitySubmissionBatch.cancelledAt.isNotNull();
            // 제출 이력 = 완료 또는 취소(= REVIEWING 이 아닌 모든 배치). 지난 배치만 모아 보여준다.
            case ARCHIVED -> facilitySubmissionBatch.completedAt.isNotNull()
                    .or(facilitySubmissionBatch.cancelledAt.isNotNull());
        };
    }

    /**
     * 키워드(콘솔 UX 스펙 A3) — 제출번호·메모·동아리명 부분 일치 OR. 동아리명은 배치의 club_id 서브쿼리로
     * 조인 없이 건다(Club 은 @SQLRestriction 으로 삭제 동아리가 자동 제외됨). 공백만이면 무필터.
     */
    private BooleanExpression keywordMatches(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String trimmed = keyword.trim();
        return facilitySubmissionBatch.submissionNo.containsIgnoreCase(trimmed)
                .or(facilitySubmissionBatch.memo.containsIgnoreCase(trimmed))
                .or(facilitySubmissionBatch.clubId.in(
                        JPAExpressions.select(club.id).from(club).where(club.name.containsIgnoreCase(trimmed))));
    }

    /** submittedAt 은 KST 벽시계(seoulClock) 기록 — 일 단위 하한은 그 날 00:00 포함. */
    private BooleanExpression submittedOnOrAfter(LocalDate from) {
        return from == null ? null : facilitySubmissionBatch.submittedAt.goe(from.atStartOfDay());
    }

    /** 상한은 to 다음날 00:00 미만 — to 당일 23:59:59 까지 포함. */
    private BooleanExpression submittedBefore(LocalDate to) {
        return to == null ? null : facilitySubmissionBatch.submittedAt.lt(to.plusDays(1).atStartOfDay());
    }
}
