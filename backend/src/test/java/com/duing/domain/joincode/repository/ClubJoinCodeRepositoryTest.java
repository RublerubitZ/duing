package com.duing.domain.joincode.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * 후속 PR(코드 확인·승인 차감)이 소비하는 조회 계약의 스모크.
 * 특히 {@code findWithLockById} 는 PESSIMISTIC_WRITE 라 트랜잭션 밖에서 호출하면 실패하므로,
 * 잠금 쿼리가 실제로 실행되는지(JPQL 파싱 + FOR UPDATE 발행)를 여기서 잠근다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubJoinCodeRepositoryTest {

    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("코드 문자열과 비관적 쓰기 잠금으로 가입 코드를 조회할 수 있다")
    void findByCodeAndFindWithLockById() {
        ClubJoinCode saved = clubJoinCodeRepository.save(saveJoinCode());

        assertThat(clubJoinCodeRepository.findByCode(saved.getCode()))
                .as("코드 문자열 조회").isPresent()
                .get().extracting(ClubJoinCode::getId).isEqualTo(saved.getId());
        assertThat(clubJoinCodeRepository.findByCode("ZZZZZZ"))
                .as("없는 코드는 빈 결과").isEmpty();

        assertThat(clubJoinCodeRepository.findWithLockById(saved.getId()))
                .as("잠금 조회(FOR UPDATE)").isPresent()
                .get().extracting(ClubJoinCode::getCode).isEqualTo(saved.getCode());
    }

    private ClubJoinCode saveJoinCode() {
        Club club = clubRepository.save(Club.create("가입코드레포-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null));
        Recruitment recruitment = recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
        return ClubJoinCode.issue(club, recruitment, "AB12CD", 1, 30,
                LocalDateTime.now().plusDays(30));
    }
}
