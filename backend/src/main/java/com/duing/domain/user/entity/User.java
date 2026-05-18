package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
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
}
