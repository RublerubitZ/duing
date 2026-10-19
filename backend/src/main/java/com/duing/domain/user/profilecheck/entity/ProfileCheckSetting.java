package com.duing.domain.user.profilecheck.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Optional;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 학기별 사용자 정보 확인 팝업 설정 — 행 1개(id = 1, DB CHECK 로 강제).
 *
 * <p>행은 운영진의 첫 저장이 {@code ProfileCheckSettingRepository#insertIfAbsent} 로 만든다 — 앱이 이 엔티티를
 * 새로 저장하지 않는다. BaseEntity 를 상속하지 않는다: 지우지 않는 단일 행이라 deleted_at 이 거짓 신호이고,
 * 시각은 Instant + timestamptz 로 둔다(AdminUserActionLog 전례).
 */
@Getter
@Entity
@Table(name = "profile_check_setting")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProfileCheckSetting {

    public static final long SINGLETON_ID = 1L;
    public static final String DEFAULT_TITLE = "새 학기, 내 정보를 확인해 주세요.";
    public static final String DEFAULT_MESSAGE = "새 학기가 시작되었습니다!\n\n"
            + "현재 등록된 학년과 전공 및 재학 상태가 올바른지 확인해 주세요. "
            + "정보가 변경되었다면 새로운 정보로 업데이트할 수 있습니다.";

    @Id
    private Long id;

    @Column(nullable = false)
    private boolean enabled;

    /** 켤 때 기록된 학기. 한 번도 켜지 않았으면 둘 다 null. */
    @Column(name = "semester_year")
    private Integer semesterYear;

    @Column(name = "semester_term")
    private Integer semesterTerm;

    @Column(nullable = false, length = 50)
    private String title;

    @Column(nullable = false, length = 300)
    private String message;

    @Column(name = "created_by", nullable = false, updatable = false)
    private Long createdBy;

    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Optional<Semester> recordedSemester() {
        if (semesterYear == null || semesterTerm == null) {
            return Optional.empty();
        }
        return Optional.of(new Semester(semesterYear, semesterTerm));
    }

    /** 실제 노출 여부 — 켜져 있고, 켤 때 기록한 학기가 오늘 학기와 같다. 학기가 바뀌면 자동으로 멈춘다. */
    public boolean isActiveIn(Semester today) {
        return enabled && recordedSemester().map(today::equals).orElse(false);
    }

    /**
     * 운영진 저장. 켜면 오늘 학기를 기록한다(이미 같으면 같은 값). 끄면 학기 기록은 그대로 둔다 —
     * 운영진 화면이 지난 학기 통계를 계속 보여 준다.
     */
    public void update(String title, String message, boolean enabled, Semester today, Long actorId, Instant updatedAt) {
        this.title = title;
        this.message = message;
        this.enabled = enabled;
        if (enabled) {
            this.semesterYear = today.year();
            this.semesterTerm = today.term();
        }
        this.updatedBy = actorId;
        this.updatedAt = updatedAt;
    }
}
