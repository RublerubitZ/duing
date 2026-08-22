package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminListQuery;
import com.duing.domain.promotion.service.dto.query.PromotionCardQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralPromotionServiceTest {

    @Autowired PromotionService promotionService;
    @Autowired PromotionRepository promotionRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveAdmin() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "A" + seq, "h", UserRole.ADMIN,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("Promotion 생성 시 createdBy 가 저장된다")
    void createSucceeds() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", "https://x", true, 1, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
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
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, false, 5, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null, null, null));

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
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, null, null, true,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null, null, null));

        assertThat(promotionRepository.findById(id).orElseThrow().getClubId()).isNull();
    }

    @Test
    @DisplayName("soft delete 후 findById 는 비어 있고 공개 목록에도 안 나온다")
    void softDeleteHidesFromPublic() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        promotionService.delete(id);

        assertThat(promotionRepository.findById(id)).isEmpty();
        assertThat(promotionService.findPublicCards(PageRequest.of(0, 10)).getContent())
                .noneMatch(card -> card.id().equals(id));
    }

    @Test
    @DisplayName("findPublic 은 active=true 만 displayOrder ASC 정렬로 반환한다")
    void findPublicSortedByDisplayOrder() {
        User admin = saveAdmin();
        Long inactiveId = promotionService.create(new CreatePromotionCommand(
                null, "비활성", "/files/x.png", null, false, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        Long second = promotionService.create(new CreatePromotionCommand(
                null, "두번째", "/files/2.png", null, true, 20, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        Long first = promotionService.create(new CreatePromotionCommand(
                null, "첫번째", "/files/1.png", null, true, 10, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));

        var content = promotionService.findPublicCards(PageRequest.of(0, 10)).getContent();
        assertThat(content).extracting(PromotionCardQuery::id).containsExactly(first, second);
        assertThat(content).noneMatch(card -> card.id().equals(inactiveId));
    }

    @Test
    @DisplayName("findPublic 은 startAt 이 미래인 예정 배너와 endAt 이 과거인 종료 배너를 제외한다")
    void findPublicFiltersByScheduleRange() {
        User admin = saveAdmin();
        LocalDateTime now = LocalDateTime.now();
        Long alwaysOn = promotionService.create(new CreatePromotionCommand(
                null, "상시", "/files/now.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        Long upcoming = promotionService.create(new CreatePromotionCommand(
                null, "예정", "/files/u.png", null, true, 10, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                now.plusDays(3), null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        Long expired = promotionService.create(new CreatePromotionCommand(
                null, "종료", "/files/e.png", null, true, 20, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, now.minusDays(1),
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        Long inRange = promotionService.create(new CreatePromotionCommand(
                null, "구간", "/files/r.png", null, true, 30, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                now.minusDays(1), now.plusDays(1),
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));

        var content = promotionService.findPublicCards(PageRequest.of(0, 10)).getContent();
        assertThat(content).extracting(PromotionCardQuery::id)
                .contains(alwaysOn, inRange)
                .doesNotContain(upcoming, expired);
    }

    @Test
    @DisplayName("존재하지 않는 Promotion 갱신은 404")
    void updateMissingFails() {
        assertThatThrownBy(() -> promotionService.update(new UpdatePromotionCommand(
                999_999L, "X", null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null, null, null)))
                .isInstanceOf(PromotionException.PromotionNotFoundException.class);
    }

    private Notice saveNotice(NoticeVisibility visibility) {
        User author = saveAdmin();
        return noticeRepository.save(Notice.create(
                "테스트 공지" + sequence.incrementAndGet(),
                "요약",
                "본문",
                "/files/cover.png",
                null,
                NoticeCategory.GENERAL,
                List.of(),
                visibility,
                null,
                false,
                null,
                false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN,
                author.getId()));
    }

    @Test
    @DisplayName("공지 연결 create 가 PUBLIC 공지에 대해 성공한다")
    void createWithPublicNoticeSucceeds() {
        User admin = saveAdmin();
        Notice notice = saveNotice(NoticeVisibility.PUBLIC);
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "공지 배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                notice.getId()));
        assertThat(promotionRepository.findById(id).orElseThrow().getNoticeId())
                .isEqualTo(notice.getId());
    }

    @Test
    @DisplayName("비공개 공지를 연결하려고 하면 NonPublicNoticeLinkException")
    void createWithNonPublicNoticeThrows() {
        User admin = saveAdmin();
        Notice notice = saveNotice(NoticeVisibility.OFFICERS_ALL);
        assertThatThrownBy(() -> promotionService.create(new CreatePromotionCommand(
                null, "T", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                notice.getId())))
                .isInstanceOf(PromotionException.NonPublicNoticeLinkException.class);
    }

    @Test
    @DisplayName("공개 카드는 연결 공지가 비공개면 제목을 감추고 접근 불가로 내린다")
    void publicCardMasksNonPublicNoticeTitle() {
        User admin = saveAdmin();
        Notice hidden = saveNotice(NoticeVisibility.OFFICERS_ALL);
        // 연결 시점엔 PUBLIC 이었다가 뒤늦게 비공개로 바뀐 상태 — create 검증을 우회해 직접 저장한다.
        promotionRepository.save(Promotion.create(
                null, "공지 배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, hidden.getId()));

        PromotionCardQuery card = promotionService.findPublicCards(PageRequest.of(0, 50)).getContent().stream()
                .filter(item -> item.notice() != null && item.notice().id().equals(hidden.getId()))
                .findFirst().orElseThrow();

        assertThat(card.notice().accessible()).isFalse();
        assertThat(card.notice().title()).isEmpty();
    }

    @Test
    @DisplayName("어드민 상세는 삭제된 연결 공지를 삭제 라벨과 접근 불가로 식별시킨다")
    void adminDetailLabelsDeletedNotice() {
        User admin = saveAdmin();
        Notice notice = saveNotice(NoticeVisibility.PUBLIC);
        Long promotionId = promotionService.create(new CreatePromotionCommand(
                null, "공지 배너", "/files/b.png", null, true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                notice.getId()));
        noticeRepository.delete(notice);
        // soft delete 는 1차 캐시의 관리 엔티티를 그대로 두므로, 비우지 않으면 findById 가 삭제 전 상태를 돌려준다.
        entityManager.flush();
        entityManager.clear();

        PromotionAdminListQuery query = promotionService.getAdminItemById(promotionId);

        assertThat(query.notice().title()).isEqualTo(AdminLabels.DELETED);
        assertThat(query.notice().visibility()).isNull();
        assertThat(query.notice().accessible()).isFalse();
    }

    @Test
    @DisplayName("Service Validator 도 다중 link 를 거부한다 (Request 우회 시 안전망)")
    void createRejectsMultipleLinks() {
        User admin = saveAdmin();
        Club club = clubRepository.save(Club.create(
                "두잉" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null));
        assertThatThrownBy(() -> promotionService.create(new CreatePromotionCommand(
                club.getId(), "T", "/files/b.png", "https://x.com", true, 0, admin.getId(),
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null)))
                .isInstanceOf(PromotionException.MultipleLinkTargetsException.class);
    }
}
