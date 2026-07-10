package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserCreateTest {

    @Test
    @DisplayName("User.create 는 학년·단과·전공·전화번호·약관동의시각을 모두 보관한다")
    void createPopulatesProfileFields() {
        LocalDateTime termsAgreedAt = LocalDateTime.now();

        User user = User.create(
                "20240001",
                "홍길동",
                "hong@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "010-1234-5678",
                termsAgreedAt
        );

        assertThat(user.getGrade()).isEqualTo(Grade.JUNIOR);
        assertThat(user.getCollege()).isEqualTo(College.IT_ENGINEERING);
        assertThat(user.getMajor()).isEqualTo("컴퓨터정보공학부");
        assertThat(user.getPhone()).isEqualTo("010-1234-5678");
        assertThat(user.getTermsAgreedAt()).isEqualTo(termsAgreedAt);
    }

    @Test
    @DisplayName("생성 직후 phoneVerifiedAt 은 null(미인증)이고, markPhoneVerified 로 인증 시각이 기록된다")
    void markPhoneVerifiedRecordsVerificationTime() {
        LocalDateTime verifiedAt = LocalDateTime.now();
        User user = User.create(
                "20240001", "홍길동", "hong@daegu.ac.kr", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부", "010-1234-5678",
                verifiedAt.minusMinutes(1));

        assertThat(user.getPhoneVerifiedAt()).isNull();

        user.markPhoneVerified(verifiedAt);

        assertThat(user.getPhoneVerifiedAt()).isEqualTo(verifiedAt);
    }
}

