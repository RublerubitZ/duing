package com.duing.domain.clubmember.controller.dto.response;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.user.entity.Grade;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubMemberResponseTest {

    @Test
    @DisplayName("응답으로 변환할 때 전화번호는 마스킹되고 학과·학년은 그대로 전달된다")
    void masksPhoneAndCarriesMajorGrade() {
        ClubMemberQuery query = new ClubMemberQuery(
                1L, 42L, "구승율", "20210001", ClubMemberRole.MEMBER,
                LocalDateTime.of(2026, 1, 1, 0, 0),
                "컴퓨터정보공학", Grade.SENIOR, "010-1234-5678");

        ClubMemberResponse response = ClubMemberResponse.from(query);

        assertThat(response.major()).isEqualTo("컴퓨터정보공학");
        assertThat(response.grade()).isEqualTo(Grade.SENIOR);
        assertThat(response.phoneMasked()).isEqualTo("010-****-5678");
    }

    @Test
    @DisplayName("전화번호가 null 이면 phoneMasked 도 null 이다")
    void nullPhoneStaysNull() {
        ClubMemberQuery query = new ClubMemberQuery(
                1L, 42L, "구승율", "20210001", ClubMemberRole.MEMBER,
                LocalDateTime.of(2026, 1, 1, 0, 0),
                "컴퓨터정보공학", Grade.SENIOR, null);

        assertThat(ClubMemberResponse.from(query).phoneMasked()).isNull();
    }
}
