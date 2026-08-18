package com.duing.domain.club.heroactivity.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import com.duing.domain.club.heroactivity.exception.ClubHeroActivityException;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.heroactivity.service.dto.command.CreateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand.HeroOrder;
import com.duing.domain.club.heroactivity.service.dto.command.UpdateHeroActivityCommand;
import com.duing.domain.club.heroactivity.service.dto.query.HeroActivityQuery;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.clubmember.service.ClubAuthService;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubHeroActivityService implements ClubHeroActivityService {

    private static final int MIN_SLOT = 1;
    private static final int MAX_SLOT = 6;

    private final ClubHeroActivityRepository clubHeroActivityRepository;
    private final ClubPhotoRepository clubPhotoRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;
    private final ClubVisibilityPolicy clubVisibilityPolicy;

    @Override
    public List<HeroActivityQuery> getByClubId(Long clubId) {
        // 공개 엔드포인트 전용 — 비공개 동아리는 게이트가 404 로 숨긴다.
        clubVisibilityPolicy.requirePubliclyVisible(clubId);
        return clubHeroActivityRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(HeroActivityQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public HeroActivityQuery create(CreateHeroActivityCommand command) {
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        ClubPhoto photo = findPhotoInClub(command.clubPhotoId(), command.clubId());

        if (isSlotOutOfRange(command.displayOrder())) {
            throw new ClubHeroActivityException.SlotOutOfRange();
        }
        if (clubHeroActivityRepository.existsByClubIdAndDisplayOrder(
                command.clubId(), command.displayOrder())) {
            throw new ClubHeroActivityException.SlotOccupied();
        }
        if (clubHeroActivityRepository.existsByClubIdAndClubPhotoId(
                command.clubId(), command.clubPhotoId())) {
            throw new ClubHeroActivityException.PhotoAlreadyFeatured();
        }

        ClubHeroActivity activity = ClubHeroActivity.create(
                club, photo, command.title(), command.description(), command.displayOrder());
        return HeroActivityQuery.from(clubHeroActivityRepository.save(activity));
    }

    @Override
    @Transactional
    public void update(UpdateHeroActivityCommand command) {
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());
        ClubHeroActivity activity = findActivityInClub(command.heroActivityId(), command.clubId());

        Long newPhotoId = command.clubPhotoId();
        if (newPhotoId != null && !newPhotoId.equals(activity.getClubPhoto().getId())) {
            ClubPhoto photo = findPhotoInClub(newPhotoId, command.clubId());
            // 자기 자신은 위 equals 로 이미 제외됨 — 여기서 true 면 다른 활동이 점유 중.
            if (clubHeroActivityRepository.existsByClubIdAndClubPhotoId(
                    command.clubId(), newPhotoId)) {
                throw new ClubHeroActivityException.PhotoAlreadyFeatured();
            }
            activity.changePhoto(photo);
        }
        activity.updateContent(command.title(), command.description());
    }

    @Override
    @Transactional
    public List<HeroActivityQuery> reorder(ReorderHeroActivitiesCommand command) {
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());

        List<ClubHeroActivity> current = clubHeroActivityRepository.findByClubId(command.clubId());
        Set<Long> currentIds = current.stream()
                .map(ClubHeroActivity::getId).collect(Collectors.toSet());
        Set<Long> payloadIds = command.orders().stream()
                .map(HeroOrder::heroActivityId).collect(Collectors.toSet());
        if (payloadIds.size() != command.orders().size() || !currentIds.equals(payloadIds)) {
            throw new ClubHeroActivityException.OrderMismatch();
        }

        Set<Integer> targetSlots = new HashSet<>();
        for (HeroOrder order : command.orders()) {
            if (isSlotOutOfRange(order.displayOrder())) {
                throw new ClubHeroActivityException.SlotOutOfRange();
            }
            if (!targetSlots.add(order.displayOrder())) {
                throw new ClubHeroActivityException.OrderMismatch();
            }
        }

        Map<Long, ClubHeroActivity> byId = current.stream()
                .collect(Collectors.toMap(ClubHeroActivity::getId, activity -> activity));

        // 부분 유니크(club_id, display_order) 는 문장 단위 검사 — 슬롯 스왑 시 중간 충돌을 피하려
        // 1차로 전원을 목표값의 음수(충돌 불가값)로 바꿔 flush 하고, 2차로 목표값을 적용한다.
        command.orders().forEach(order ->
                byId.get(order.heroActivityId()).changeDisplayOrder(-order.displayOrder()));
        clubHeroActivityRepository.flush();

        command.orders().forEach(order ->
                byId.get(order.heroActivityId()).changeDisplayOrder(order.displayOrder()));
        clubHeroActivityRepository.flush();

        return clubHeroActivityRepository.findByClubIdOrderByDisplayOrderAsc(command.clubId()).stream()
                .map(HeroActivityQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long requesterId, Long heroActivityId) {
        clubAuthService.requireEditableClubManager(requesterId, clubId);
        ClubHeroActivity activity = findActivityInClub(heroActivityId, clubId);
        // 슬롯을 당기지 않고 빈 슬롯으로 유지한다(스펙: display_order 재배치 없음).
        clubHeroActivityRepository.delete(activity);
    }

    private boolean isSlotOutOfRange(int displayOrder) {
        return displayOrder < MIN_SLOT || displayOrder > MAX_SLOT;
    }

    private ClubHeroActivity findActivityInClub(Long heroActivityId, Long clubId) {
        ClubHeroActivity activity = clubHeroActivityRepository.findById(heroActivityId)
                .orElseThrow(ClubHeroActivityException.NotFound::new);
        if (!activity.getClub().getId().equals(clubId)) {
            throw new ClubHeroActivityException.NotInClub();
        }
        return activity;
    }

    private ClubPhoto findPhotoInClub(Long clubPhotoId, Long clubId) {
        // 사진 행을 PESSIMISTIC_WRITE 로 잠근다 — 사진 삭제 가드(GeneralClubPhotoService.delete)와 같은
        // 사진 행을 두고 직렬화해 soft-delete 된 사진을 참조하는 대표 활동이 성립하는 TOCTOU 를 차단한다.
        // 삭제가 선행했다면 @SQLRestriction 재적용으로 빈 결과 → PhotoNotFound 로 안전하게 실패한다.
        ClubPhoto photo = clubPhotoRepository.findByIdForUpdate(clubPhotoId)
                .orElseThrow(ClubHeroActivityException.PhotoNotFound::new);
        if (!photo.getClub().getId().equals(clubId)) {
            throw new ClubHeroActivityException.PhotoNotFound();
        }
        return photo;
    }
}
