package com.duing.domain.recruitment.repository;

import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.dsl.BooleanExpression;
import java.time.LocalDate;

/**
 * "지금 유효한 모집" 판정의 QueryDSL 단일 표현 — Java 정본(Recruitment.isEffectivelyOpen)과의
 * 동치 계약을 한 곳에 고정한다(RecruitmentPredicatesTest 가 동치를 검증한다).
 *
 * <p>배경: 이 술어가 리포지토리마다 손으로 재작성되면서 사본 간 드리프트가 실제 버그로 발현됐다
 * (상시모집 카운트 누락 #995, 마감임박 정렬·알림 오염 #996). 이후 소비처는 이 팩토리를 쓰고,
 * 세 번째 재작성을 만들지 말 것.
 *
 * <p>판정 의미는 두 축으로 분리되어 있으며 서로 대체할 수 없다:
 * <ul>
 *   <li>{@link #effectivelyOpen} — 진행 중 그룹 축(startDate 무관). 모집중 카운트·대표 모집 우선순위·
 *       활성 모집 조회(자동 마감 대상 선정)가 쓴다. uk_recruitment_club_active 와 같은 축.</li>
 *   <li>{@link #availableToday} — 오늘 지원 가능 축(startDate 도래 포함). 탐색 AVAILABLE 필터·
 *       마감임박 정렬처럼 모집예정(UPCOMING)을 제외해야 하는 자리가 쓴다.</li>
 * </ul>
 * 둘을 하나로 뭉치면 대표 모집 선정·CLOSED 필터의 의미가 바뀌어 목록·상세 표기 불일치(#895 류)가
 * 재발한다.
 *
 * <p>deletedAt 조건은 명시로 포함한다 — FROM 절 서브쿼리에는 @SQLRestriction 이 자동 적용되어
 * 중복이지만, 명시 조인 ON 절처럼 적용 여부가 문맥 의존적인 자리에서도 술어만으로 안전하게 한다.
 *
 * <p>구조상 재사용이 불가능한 두 곳은 동치 주석·테스트로만 결속된다: 추천 정렬의 표기 그룹
 * CASE(ClubRepositoryImpl — RecruitmentDisplayStatus.resolve 동치 계약)와 마감 임박 알림의
 * 네이티브 쿼리(RecruitmentRepository.findDeadlineNotificationCandidates).
 */
public final class RecruitmentPredicates {

    private RecruitmentPredicates() {
    }

    /** {@code Recruitment.isEffectivelyOpen(today)} 의 SQL 동치: OPEN ∧ (endDate 없음(상시모집) ∨ 종료일 미경과). */
    public static BooleanExpression effectivelyOpen(LocalDate today) {
        return recruitment.status.eq(RecruitmentStatus.OPEN)
                .and(recruitment.endDate.isNull().or(recruitment.endDate.goe(today)))
                .and(recruitment.deletedAt.isNull());
    }

    /** 오늘 지원 가능: {@link #effectivelyOpen} ∧ 시작일 도래. 모집예정(UPCOMING)은 제외된다. */
    public static BooleanExpression availableToday(LocalDate today) {
        return effectivelyOpen(today).and(recruitment.startDate.loe(today));
    }
}
