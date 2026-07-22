package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.repository.ClubRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * JSONB 임베드 record 의 미지 키 내성(@JsonIgnoreProperties) 게이트 —
 * 이후 릴리스가 sns_links/faqs 에 키를 추가한 뒤 이 버전으로 롤백해도 동아리 조회가 깨지지 않아야 한다.
 */
@Transactional
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubJsonbForwardCompatTest extends IntegrationTestBase {

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("sns_links 원소에 미래 버전이 추가한 미지 키가 있어도 동아리 조회가 실패하지 않는다")
    void unknownKeyInSnsLinksJsonbIsIgnoredOnRead() {
        Club club = clubRepository.saveAndFlush(
                Club.create("롤백호환테스트", ClubCategory.ACADEMIC, "학술", "소개", null));
        jdbcTemplate.update(
                "UPDATE club SET sns_links = ?::jsonb, faqs = ?::jsonb WHERE id = ?",
                "[{\"platform\":\"INSTAGRAM\",\"url\":\"https://instagram.com/doing\",\"label\":\"미래키\"}]",
                "[{\"question\":\"질문\",\"answer\":\"답변\",\"order\":0,\"pinned\":true}]",
                club.getId());
        entityManager.clear();

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();

        assertThat(reloaded.getSnsLinks()).hasSize(1);
        assertThat(reloaded.getSnsLinks().get(0).platform()).isEqualTo("INSTAGRAM");
        assertThat(reloaded.getFaqs()).hasSize(1);
        assertThat(reloaded.getFaqs().get(0).question()).isEqualTo("질문");
    }
}
