package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_round")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달한다 (Application 전례).
@SQLDelete(sql = "UPDATE interview_round SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewRound extends BaseEntity {

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(nullable = false, length = 100)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoundStatus status;

    // DRAFT 동안 nullable — DRAFT→COLLECTING 발송 전이 가드에서 NOT NULL 을 요구한다 (BE#5).
    @Column(name = "availability_deadline")
    private LocalDateTime availabilityDeadline;

    @Column(length = 200)
    private String location;

    // timestamptz 컬럼 — 확정이 일어난 절대시각으로 저장한다 (V113 백필로 기존 KST 벽시계 행 정정).
    @Column(name = "assignment_completed_at")
    private Instant assignmentCompletedAt;

    // MVP 는 Availability 요청/재알림 dedupKey 생성용 — 발송·재알림·Rule 2 재초대 직전에 증가한다.
    // 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능 (스펙 §4·§8).
    @Column(name = "request_sequence", nullable = false)
    private int requestSequence;

    // 자동배정/확정/취소 동시 실행 race 차단 (스펙 §7 — Application @Version 전례)
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewRound(Long recruitmentId, String title,
                           LocalDateTime availabilityDeadline, String location) {
        this.recruitmentId = recruitmentId;
        this.title = title;
        this.status = RoundStatus.DRAFT;
        this.availabilityDeadline = availabilityDeadline;
        this.location = location;
        this.requestSequence = 0;
    }

    public static InterviewRound create(Long recruitmentId, String title,
                                        LocalDateTime availabilityDeadline, String location) {
        return InterviewRound.builder()
                .recruitmentId(recruitmentId)
                .title(title)
                .availabilityDeadline(availabilityDeadline)
                .location(normalizeNullable(location))
                .build();
    }

    /**
     * 가용시간 응답 마감이 지났는가 — unresponded 파생·마감 뱃지의 단일 판정 지점.
     * 마감이 없으면(DRAFT 구간) 경과가 아니고, 정각(now == deadline)도 경과가 아니다.
     * 주의: 수집 오픈 검증(openCollecting)·응답 창(GeneralApplicantInterviewService)·Rule 2 재초대 창
     * (GeneralInterviewSlotService)은 정각 취급이 달라 이 메서드를 쓰지 않는다 — 경계 시멘틱이 다른 별도 규칙이다.
     */
    public boolean isAvailabilityDeadlinePassed(LocalDateTime now) {
        return this.availabilityDeadline != null && now.isAfter(this.availabilityDeadline);
    }

    /**
     * 발송: DRAFT → COLLECTING (스펙 §5.1). 마감은 발송의 전제 조건이라 도메인이 직접 검증한다 —
     * 생성 시점에 미래였어도 발송까지 시간이 흐를 수 있어 재검증한다.
     * 슬롯·멤버 존재 가드는 레포지토리가 필요하므로 서비스가 담당한다 (스펙 §10.3 가드 3종 중 나머지).
     */
    public void openCollecting(LocalDateTime now) {
        if (this.status != RoundStatus.DRAFT) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        if (this.availabilityDeadline == null) {
            throw new InterviewException.AvailabilityDeadlineRequired();
        }
        if (!this.availabilityDeadline.isAfter(now)) {
            throw new InterviewException.InvalidDeadline();
        }
        this.status = RoundStatus.COLLECTING;
    }

    /**
     * 자동배정 실행: COLLECTING → ASSIGNING (스펙 §5.1·§6.2). 이미 ASSIGNING 인 재실행은
     * 전이가 아니므로 서비스가 분기한다 — 이 메서드는 첫 실행 전이만 담당한다.
     */
    public void openAssigning() {
        if (this.status != RoundStatus.COLLECTING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.ASSIGNING;
    }

    /**
     * 확정: ASSIGNING → SCHEDULED (터미널, 스펙 §5.1·§6.3) + 확정 시각 기록. 재확정·확정 후 변경 경로는 없다 (§14).
     * 전이 판정은 상태만 보므로 {@code now} 는 기록 전용이다 — 존 해석이 끼지 않도록 절대시각(Instant)으로 받는다.
     */
    public void confirm(Instant now) {
        if (this.status != RoundStatus.ASSIGNING) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.SCHEDULED;
        this.assignmentCompletedAt = now;
    }

    /**
     * 취소: DRAFT·COLLECTING·ASSIGNING → CANCELLED (스펙 §5.1·§9.1 API 12). 멤버는 건드리지
     * 않는다 — placement 술어(round ≠ CANCELLED)가 자동 큐 복귀를, 이력 쿼리가 WAITING_NEXT_ROUND
     * 표시를 처리한다. 활성 schedule 정리(§16-2)는 서비스 담당.
     */
    public void cancel() {
        if (this.status == RoundStatus.SCHEDULED || this.status == RoundStatus.CANCELLED) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.status = RoundStatus.CANCELLED;
    }

    /**
     * 제목·장소 부분 수정 (null·공백 = 무변경) — ASSIGNING 까지 허용: 배정 검토 중 장소 확정 입력 후
     * confirm 이 주 시나리오다. SCHEDULED·CANCELLED 는 불변 (§14 확정 후 변경 없음).
     */
    public void updateInfo(String title, String location) {
        if (this.status == RoundStatus.SCHEDULED || this.status == RoundStatus.CANCELLED) {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        if (title != null) {
            this.title = title;
        }
        if (location != null && !location.trim().isEmpty()) {
            this.location = location.trim();
        }
    }

    /**
     * 마감 변경 (스펙 §9.1 API 7) — DRAFT 는 미래 시각이면 자유, COLLECTING 은 연장만(기존보다
     * 뒤 + 미래): 단축은 응답 중인 지원자의 기회를 소급 박탈하고 미응답 파생을 즉시 뒤집는다.
     * 이 "연장만" 제약이 응답 API(round 비잠금)와의 race 를 무해하게 만든다 — 변경은 기회를
     * 넓히는 방향뿐이다. ASSIGNING 부터는 수집이 끝나 변경이 무의미하다.
     */
    public void updateDeadline(LocalDateTime newDeadline, LocalDateTime now) {
        if (this.status == RoundStatus.DRAFT) {
            if (!newDeadline.isAfter(now)) {
                throw new InterviewException.InvalidDeadline();
            }
        } else if (this.status == RoundStatus.COLLECTING) {
            if (this.availabilityDeadline != null && !newDeadline.isAfter(this.availabilityDeadline)) {
                throw new InterviewException.InvalidDeadline();
            }
            if (!newDeadline.isAfter(now)) {
                throw new InterviewException.InvalidDeadline();
            }
        } else {
            throw new InterviewException.RoundTransitionNotAllowed();
        }
        this.availabilityDeadline = newDeadline;
    }

    /**
     * Availability 요청 회차를 1 올린다 — 발송·재알림·Rule 2 재초대 모두 발동 직전에 호출한다.
     * 안 올리면 직전 발송과 dedupKey 가 같아져 재알림이 deduped 되어 소실된다 (스펙 §8).
     */
    public void increaseRequestSequence() {
        this.requestSequence++;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
