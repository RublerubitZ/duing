package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
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
class ClubRepositoryImplFavoriteFilterTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired ClubFavoriteRepository clubFavoriteRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("favoriteUserId 를 지정하면 해당 사용자가 찜한 동아리만 반환된다")
    void favoriteFilterReturnsOnlyFavoritedClubs() throws Exception {
        User student = saveStudent("찜필터학생");
        Club favorited = saveActiveClub("찜한클럽", ClubCategory.ACADEMIC);
        Club notFavorited = saveActiveClub("안찜한클럽", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(student, favorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Club::getId)
                .containsExactly(favorited.getId())
                .doesNotContain(notFavorited.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("찜 필터는 카테고리 필터와 조합되어 교집합만 반환된다")
    void favoriteFilterCombinesWithCategory() throws Exception {
        User student = saveStudent("조합학생");
        Club academicFavorited = saveActiveClub("학술찜", ClubCategory.ACADEMIC);
        Club sportsFavorited = saveActiveClub("운동찜", ClubCategory.SPORTS);
        clubFavoriteRepository.save(ClubFavorite.create(student, academicFavorited));
        clubFavoriteRepository.save(ClubFavorite.create(student, sportsFavorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), ClubCategory.ACADEMIC), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Club::getId)
                .containsExactly(academicFavorited.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("해제(soft-delete)된 찜은 찜 필터 결과에서 제외된다")
    void softDeletedFavoriteIsExcluded() throws Exception {
        User student = saveStudent("해제학생");
        Club onceFavorited = saveActiveClub("해제된클럽", ClubCategory.ACADEMIC);
        ClubFavorite favorite = clubFavoriteRepository.save(ClubFavorite.create(student, onceFavorited));

        clubFavoriteRepository.delete(favorite);   // @SQLDelete — deleted_at 스탬프
        clubFavoriteRepository.flush();

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(student.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }

    @Test
    @DisplayName("다른 사용자의 찜은 내 찜 필터 결과에 섞이지 않는다")
    void otherUsersFavoritesAreNotIncluded() throws Exception {
        User me = saveStudent("본인");
        User other = saveStudent("타인");
        Club otherFavorited = saveActiveClub("타인찜클럽", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(other, otherFavorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(me.getId(), null), PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
    }

    @Test
    @DisplayName("favoriteUserId 가 null 이면 찜 필터가 적용되지 않고 전체가 반환된다")
    void nullFavoriteUserIdDisablesFilter() throws Exception {
        User student = saveStudent("널학생");
        Club favorited = saveActiveClub("널찜", ClubCategory.ACADEMIC);
        Club notFavorited = saveActiveClub("널안찜", ClubCategory.ACADEMIC);
        clubFavoriteRepository.save(ClubFavorite.create(student, favorited));

        Page<Club> result = clubRepository.findByCondition(
                favoriteCondition(null, null), PageRequest.of(0, 100));

        // 다른 테스트가 커밋한 데이터가 공존할 수 있어 정확한 개수 대신 포함 여부만 단언한다.
        assertThat(result.getContent()).extracting(Club::getId)
                .contains(favorited.getId(), notFavorited.getId());
    }

    private ClubSearchCondition favoriteCondition(Long favoriteUserId, ClubCategory category) {
        return new ClubSearchCondition(
                category, null, null, null, null, null, null, null, null, null, favoriteUserId);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name, ClubCategory category) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
