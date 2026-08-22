package com.duing.domain.publicactivity.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubevent.entity.QClubEvent.clubEvent;
import static com.duing.domain.fee.entity.QFeePolicy.feePolicy;
import static com.duing.domain.interview.entity.QInterviewRound.interviewRound;
import static com.duing.domain.notice.entity.QNotice.notice;
import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import com.duing.global.time.TimeMapper;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.DateTimePath;
import com.querydsl.core.types.dsl.NumberPath;
import com.querydsl.core.types.dsl.StringPath;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

// 여러 도메인 엔티티를 읽기 전용으로 가로질러 집계하는 standalone 쿼리 리포지토리.
// 단일 애그리거트의 JpaRepository fragment 가 아니므로 {Domain}RepositoryCustom/Impl 패턴을 쓰지 않고 독립 @Repository 로 둔다.
@Repository
@RequiredArgsConstructor
public class PublicActivityQueryRepository {

    private final JPAQueryFactory queryFactory;

    public List<ActivityItem> findRecentRecruitOpen(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, recruitment.createdAt)
                .from(recruitment)
                .where(
                        recruitment.club.status.eq(ClubStatus.ACTIVE),
                        recruitment.status.eq(RecruitmentStatus.OPEN), // 마감(CLOSED) 모집은 '신규 오픈' 활동에서 제외
                        recruitment.createdAt.goe(since)
                )
                .orderBy(recruitment.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.RECRUIT_OPEN,
                recruitment.club.id, recruitment.club.name, recruitment.createdAt);
    }

    public List<ActivityItem> findRecentNoticeCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, notice.createdAt)
                .from(notice)
                .join(club).on(club.id.eq(notice.owningClubId))
                .where(
                        notice.owningClubId.isNotNull(),
                        notice.visibility.eq(NoticeVisibility.PUBLIC),
                        club.status.eq(ClubStatus.ACTIVE),
                        notice.createdAt.goe(since)
                )
                .orderBy(notice.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.NOTICE_CREATED, club.id, club.name, notice.createdAt);
    }

    public List<ActivityItem> findRecentInterviewCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, interviewRound.createdAt)
                .from(interviewRound)
                .join(recruitment).on(recruitment.id.eq(interviewRound.recruitmentId))
                .where(
                        interviewRound.status.in(RoundStatus.COLLECTING, RoundStatus.ASSIGNING, RoundStatus.SCHEDULED),
                        recruitment.club.status.eq(ClubStatus.ACTIVE),
                        interviewRound.createdAt.goe(since)
                )
                .orderBy(interviewRound.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.INTERVIEW_CREATED,
                recruitment.club.id, recruitment.club.name, interviewRound.createdAt);
    }

    // assignment_completed_at 은 저장이 Instant 로 정합화되어(V113) 벽시계 해석이 끼지 않는다 —
    // 경계도 결과도 절대시각 그대로 오간다. (/TIMEZONE.md)
    public List<ActivityItem> findRecentInterviewResult(Instant since, int limit) {
        List<Tuple> rows = queryFactory
                .select(recruitment.club.id, recruitment.club.name, interviewRound.assignmentCompletedAt)
                .from(interviewRound)
                .join(recruitment).on(recruitment.id.eq(interviewRound.recruitmentId))
                .where(
                        interviewRound.status.eq(RoundStatus.SCHEDULED),
                        interviewRound.assignmentCompletedAt.isNotNull(),
                        interviewRound.assignmentCompletedAt.goe(since),
                        recruitment.club.status.eq(ClubStatus.ACTIVE)
                )
                .orderBy(interviewRound.assignmentCompletedAt.desc())
                .limit(limit)
                .fetch();
        return rows.stream()
                .map(row -> new ActivityItem(
                        PublicActivityType.INTERVIEW_RESULT,
                        row.get(recruitment.club.id),
                        row.get(recruitment.club.name),
                        row.get(interviewRound.assignmentCompletedAt)))
                .toList();
    }

    public List<ActivityItem> findRecentEventCreated(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, clubEvent.createdAt)
                .from(clubEvent)
                .join(club).on(club.id.eq(clubEvent.clubId))
                // ClubEvent 엔 공개/비공개 필드가 없어 모든 동아리 일정을 공개로 취급한다.
                // 향후 visibility 필드가 추가되면 여기에 필터를 더해야 한다.
                .where(
                        club.status.eq(ClubStatus.ACTIVE),
                        clubEvent.createdAt.goe(since)
                )
                .orderBy(clubEvent.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.EVENT_CREATED, club.id, club.name, clubEvent.createdAt);
    }

    public List<ActivityItem> findRecentFeeOpen(LocalDateTime since, int limit) {
        List<Tuple> rows = queryFactory
                .select(club.id, club.name, feePolicy.createdAt)
                .from(feePolicy)
                .join(club).on(club.id.eq(feePolicy.clubId))
                .where(
                        feePolicy.active.isTrue(),
                        club.status.eq(ClubStatus.ACTIVE),
                        feePolicy.createdAt.goe(since)
                )
                .orderBy(feePolicy.createdAt.desc())
                .limit(limit)
                .fetch();
        return toItems(rows, PublicActivityType.FEE_OPEN, club.id, club.name, feePolicy.createdAt);
    }

    // created_at 등은 JPA 감사가 JVM 기본 존으로 기록하므로 system 벽시계로 해석한다. (/TIMEZONE.md)
    private List<ActivityItem> toItems(List<Tuple> rows, PublicActivityType type,
                                       NumberPath<Long> clubIdPath, StringPath clubNamePath,
                                       DateTimePath<LocalDateTime> tsPath) {
        return rows.stream()
                .map(row -> new ActivityItem(
                        type,
                        row.get(clubIdPath),
                        row.get(clubNamePath),
                        TimeMapper.systemWallClockToInstant(row.get(tsPath))))
                .toList();
    }
}
