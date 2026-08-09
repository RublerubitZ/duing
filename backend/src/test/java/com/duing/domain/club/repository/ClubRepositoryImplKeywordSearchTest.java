package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.Club.UpdatePayload;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubRepositoryImplKeywordSearchTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동아리명에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesName() {
        Long target = saveActiveClub("개발동아리", "취미 모임", List.of()).getId();
        saveActiveClub("요리부", "맛있는 모임", List.of());

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("동아리 소개에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesDescription() {
        Long target = saveActiveClub("이름A", "개발을 함께 합니다", List.of()).getId();
        saveActiveClub("이름B", "요리를 함께 합니다", List.of());

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("태그에 키워드가 포함되면 검색 결과에 노출된다")
    void keywordMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();
        saveActiveClub("이름B", "소개B", List.of("봉사"));

        assertSearch("개발").containsExactly(target);
    }

    @Test
    @DisplayName("키워드에 # 접두어가 붙어도 태그 매치가 동작한다")
    void keywordWithHashPrefixMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("#개발").containsExactly(target);
    }

    @Test
    @DisplayName("키워드에 #이 연속되어도 모두 제거되어 태그 매치가 동작한다")
    void keywordWithMultipleHashPrefixMatchesTag() {
        Long target = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("##개발").containsExactly(target);
    }

    @Test
    @DisplayName("이름·소개·태그 어디에도 키워드가 없으면 검색 결과에서 제외된다")
    void keywordWithNoMatchExcludesClub() {
        saveActiveClub("요리부", "맛있는 모임", List.of("봉사"));

        assertSearch("개발").isEmpty();
    }

    @Test
    @DisplayName("키워드가 공백·# 만으로 구성되면 keyword 필터는 비활성화되어 다른 조건만 적용된다")
    void blankKeywordDisablesOnlyKeywordPredicate() {
        Long a = saveActiveClub("요리부", "맛있는 모임", List.of("봉사")).getId();
        Long b = saveActiveClub("이름A", "소개A", List.of("개발")).getId();

        assertSearch("# ").containsExactlyInAnyOrder(a, b);
    }

    @Test
    @DisplayName("태그 매치는 부분 문자열 매치를 허용한다 (프론트엔드 태그가 '엔드' 키워드에 hit)")
    void tagMatchUsesSubstringSemantics() {
        Long target = saveActiveClub("이름A", "소개A", List.of("프론트엔드")).getId();

        assertSearch("엔드").containsExactly(target);
    }

    private org.assertj.core.api.AbstractListAssert<?, java.util.List<? extends Long>, Long,
            org.assertj.core.api.ObjectAssert<Long>> assertSearch(String keyword) {
        ClubSearchCondition condition = new ClubSearchCondition(
                null, null, keyword, null, null, null, null, null, null, ClubSortOption.ALPHABETICAL, null);
        Page<Club> result = clubRepository.findByCondition(condition, PageRequest.of(0, 50));
        return assertThat(result.getContent()).extracting(Club::getId);
    }

    private Club saveActiveClub(String name, String description, List<String> tags) {
        long seq = sequence.incrementAndGet();
        Club club = Club.create(
                name + "-" + seq,
                ClubCategory.ACADEMIC,
                "분과",
                description,
                null
        );
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        if (!tags.isEmpty()) {
            club.update(new UpdatePayload(
                    null, null, null, null, null, null,
                    tags,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null));
        }
        return clubRepository.save(club);
    }
}
