package com.duing.domain.user.profilecheck.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 사용자의 학기별 정보 확인 기록 — (학기, 사용자)당 1행, 삽입 전용(UNIQUE 로 강제).
 *
 * <p>팝업 확인·프로필 저장·가입이 남긴다. 확인 당시 값은 저장하지 않는다 — 현재 값은 users 에 있고 요구된 통계는
 * 인원수뿐이다. BaseEntity 를 상속하지 않는다(수정·삭제가 없어 updated_at·deleted_at 은 거짓 신호 — V94 전례).
 * 사용자 연관은 {@code @ManyToOne} 대신 id 로 둔다(AdminUserActionLog·AuthSession 전례).
 */
@Getter
@Entity
@Table(name = "profile_check_confirmation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProfileCheckConfirmation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "semester_year", nullable = false, updatable = false)
    private int semesterYear;

    @Column(name = "semester_term", nullable = false, updatable = false)
    private int semesterTerm;

    @Column(name = "confirmed_at", nullable = false, updatable = false)
    private Instant confirmedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private ProfileCheckConfirmation(Long userId, int semesterYear, int semesterTerm, Instant confirmedAt) {
        this.userId = userId;
        this.semesterYear = semesterYear;
        this.semesterTerm = semesterTerm;
        this.confirmedAt = confirmedAt;
    }

    public static ProfileCheckConfirmation of(Long userId, Semester semester, Instant confirmedAt) {
        return ProfileCheckConfirmation.builder()
                .userId(userId)
                .semesterYear(semester.year())
                .semesterTerm(semester.term())
                .confirmedAt(confirmedAt)
                .build();
    }
}
