package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE users SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class User extends BaseEntity {

    @Column(name = "student_id", nullable = false, unique = true, length = 20)
    private String studentId;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Grade grade;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private College college;

    @Column(nullable = false, length = 50)
    private String major;

    @Column(nullable = false, length = 13)
    private String phone;

    @Column(name = "terms_agreed_at", nullable = false)
    private LocalDateTime termsAgreedAt;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "token_version", nullable = false)
    private int tokenVersion;

    @Builder(access = AccessLevel.PRIVATE)
    private User(
            String studentId,
            String name,
            String email,
            String passwordHash,
            UserRole role,
            Grade grade,
            College college,
            String major,
            String phone,
            LocalDateTime termsAgreedAt
    ) {
        this.studentId = studentId;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.grade = grade;
        this.college = college;
        this.major = major;
        this.phone = phone;
        this.termsAgreedAt = termsAgreedAt;
    }

    public static User create(
            String studentId,
            String name,
            String email,
            String passwordHash,
            UserRole role,
            Grade grade,
            College college,
            String major,
            String phone,
            LocalDateTime termsAgreedAt
    ) {
        return User.builder()
                .studentId(studentId)
                .name(name)
                .email(email)
                .passwordHash(passwordHash)
                .role(role)
                .grade(grade)
                .college(college)
                .major(major)
                .phone(phone)
                .termsAgreedAt(termsAgreedAt)
                .build();
    }

    /** 현재 시각 기준으로 계정이 로그인 잠금 상태인지 판정한다. */
    public boolean isLocked(LocalDateTime now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /**
     * 로그인 실패를 1건 기록한다. 연속 실패가 {@code maxAttempts} 에 도달하면
     * {@code lockDuration} 만큼 계정을 잠그고 실패 카운터를 0으로 리셋한다.
     */
    public void recordFailedLogin(int maxAttempts, Duration lockDuration, LocalDateTime now) {
        this.failedLoginAttempts += 1;
        if (this.failedLoginAttempts >= maxAttempts) {
            this.lockedUntil = now.plus(lockDuration);
            this.failedLoginAttempts = 0;
        }
    }

    /** 로그인 성공 시 실패 카운터와 잠금 상태를 초기화한다. */
    public void recordSuccessfulLogin() {
        this.failedLoginAttempts = 0;
        this.lockedUntil = null;
    }

    /** 토큰 버전을 올려 기존에 발급된 모든 액세스 토큰을 무효화한다(로그아웃·강제 폐기). */
    public void bumpTokenVersion() {
        this.tokenVersion += 1;
    }
}
