package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class GeneralPromotionServiceTest {

    @Autowired PromotionService promotionService;
    @Autowired PromotionRepository promotionRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveAdmin() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "A" + seq,
                "a" + seq + "@duing.ac.kr", "h", UserRole.ADMIN,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("Promotion 생성 시 createdBy 가 저장된다")
    void createSucceeds() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", "https://x", true, 1, admin.getId(),
                null, null, null, null, PromotionPalette.INK));
        Promotion saved = promotionRepository.findById(id).orElseThrow();
        assertThat(saved.getCreatedBy()).isEqualTo(admin.getId());
        assertThat(saved.isActive()).isTrue();
    }

    @Test
    @DisplayName("active 토글과 displayOrder 갱신이 partial update 로 동작한다")
    void partialUpdate() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", null, true, 1, admin.getId(),
                null, null, null, null, PromotionPalette.INK));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, false, 5, null,
                null, null, null, null, null,
                null, null, null, null, null));

        Promotion updated = promotionRepository.findById(id).orElseThrow();
        assertThat(updated.isActive()).isFalse();
        assertThat(updated.getDisplayOrder()).isEqualTo(5);
        assertThat(updated.getTitle()).isEqualTo("배너");
    }

    @Test
    @DisplayName("clearClubId=true 면 clubId 가 null 로 비워진다")
    void clearClubId() {
        User admin = saveAdmin();
        Club club = clubRepository.save(Club.create(
                "두잉홍보" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null));
        Long id = promotionService.create(new CreatePromotionCommand(
                club.getId(), "배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, null, null, true,
                null, null, null, null, null,
                null, null, null, null, null));

        assertThat(promotionRepository.findById(id).orElseThrow().getClubId()).isNull();
    }

    @Test
    @DisplayName("soft delete 후 findById 는 비어 있고 공개 목록에도 안 나온다")
    void softDeleteHidesFromPublic() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK));
        promotionService.delete(id);

        assertThat(promotionRepository.findById(id)).isEmpty();
        assertThat(promotionService.findPublic(PageRequest.of(0, 10)).getContent())
                .noneMatch(p -> p.getId().equals(id));
    }

    @Test
    @DisplayName("findPublic 은 active=true 만 displayOrder ASC 정렬로 반환한다")
    void findPublicSortedByDisplayOrder() {
        User admin = saveAdmin();
        Long inactiveId = promotionService.create(new CreatePromotionCommand(
                null, "비활성", "/files/x.png", null, false, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK));
        Long second = promotionService.create(new CreatePromotionCommand(
                null, "두번째", "/files/2.png", null, true, 20, admin.getId(),
                null, null, null, null, PromotionPalette.INK));
        Long first = promotionService.create(new CreatePromotionCommand(
                null, "첫번째", "/files/1.png", null, true, 10, admin.getId(),
                null, null, null, null, PromotionPalette.INK));

        var content = promotionService.findPublic(PageRequest.of(0, 10)).getContent();
        assertThat(content).extracting(Promotion::getId).containsExactly(first, second);
        assertThat(content).noneMatch(p -> p.getId().equals(inactiveId));
    }

    @Test
    @DisplayName("존재하지 않는 Promotion 갱신은 404")
    void updateMissingFails() {
        assertThatThrownBy(() -> promotionService.update(new UpdatePromotionCommand(
                999_999L, "X", null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null, null, null)))
                .isInstanceOf(PromotionException.PromotionNotFoundException.class);
    }
}
