package com.duing.domain.club.metric.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 동아리 상세 진입 1건 — 홈 "관심도가 높은 동아리" 집계의 원천 이벤트.
 * <p>(방문자, 동아리, KST 날짜) 당 1행이며 그 유일성은 {@code uq_cve_club_visitor_date} 가 강제한다.
 * 쓰기는 전부 {@link com.duing.domain.club.metric.repository.ClubViewEventRepository} 의
 * {@code ON CONFLICT DO NOTHING} 네이티브 삽입으로 이뤄지므로(같은 사람의 동시 재진입 경합을 단일
 * 문장 원자성으로 해소) 엔티티 쪽 생성자·mutator 는 두지 않는다 — 조회·테스트 검증 전용이다.
 * <p>추가·삭제만 있고 수정이 없는 append-only 로그라 BaseEntity(soft-delete·updated_at)를 상속하지
 * 않는다. 보존 기간이 지난 행은 {@code ClubMetricRefreshJob} 이 물리 삭제한다 — soft-delete 로 남기면
 * 8일 보존이라는 개인정보 약속이 지켜지지 않는다({@link ClubMetric} 과 같은 파생 데이터 규약).
 */
@Getter
@Entity
@Table(name = "club_view_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClubViewEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 이벤트 로그라 연관관계가 아닌 단순 id 슬롯으로 둔다(ClubMetric 과 같은 선택).
    @Column(name = "club_id", nullable = false)
    private Long clubId;

    /** 익명 방문자 키(UUID)의 SHA-256 hex 64자 — 원문은 저장하지 않는다(session_key 와 같은 VARCHAR(64) 규약). */
    @Column(name = "visitor_hash", nullable = false, length = 64)
    private String visitorHash;

    /** KST 날짜. 하루 단위 dedup 의 기준이자 집계 창·보존 정리의 기준이다. */
    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
