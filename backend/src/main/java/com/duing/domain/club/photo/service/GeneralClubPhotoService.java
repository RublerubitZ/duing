package com.duing.domain.club.photo.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubVisibilityPolicy;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.file.UploadedObjectService;
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
public class GeneralClubPhotoService implements ClubPhotoService {

    private final ClubPhotoRepository clubPhotoRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;
    private final ClubHeroActivityRepository clubHeroActivityRepository;
    private final ClubVisibilityPolicy clubVisibilityPolicy;
    // 업로드 객체 추적(#791) — 사진 URL 을 저장하는 쓰기 메서드에서 활성화한다.
    private final UploadedObjectService uploadedObjectService;

    @Override
    public List<ClubPhotoQuery> getPhotosByClubId(Long clubId) {
        // 공개 엔드포인트 전용 — 비공개 동아리는 게이트가 404 로 숨긴다.
        clubVisibilityPolicy.requirePubliclyVisible(clubId);
        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public ClubPhotoQuery create(CreateClubPhotoCommand command) {
        // 사진 관리 4곳은 프로필 보완 게이트(D6) — 재심사 보완(PENDING_APPROVAL·REJECTED)을 허용한다.
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        int nextOrder = clubPhotoRepository.findMaxDisplayOrderByClubId(command.clubId()) + 1;
        ClubPhoto photo = ClubPhoto.create(
                club, command.storageKey(), command.caption(),
                command.width(), command.height(), nextOrder
        );
        ClubPhoto savedPhoto = clubPhotoRepository.save(photo);
        // 사진 storageKey 는 프론트가 업로드 응답 url 을 그대로 보낸 값(공개 URL)이다 — 업로드 추적 활성화(#791).
        uploadedObjectService.activate(command.storageKey());
        return ClubPhotoQuery.from(savedPhoto);
    }

    @Override
    @Transactional
    public void updateCaption(UpdateClubPhotoCommand command) {
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());
        ClubPhoto photo = findPhotoInClub(command.photoId(), command.clubId());
        photo.updateCaption(command.caption());
    }

    @Override
    @Transactional
    public List<ClubPhotoQuery> reorder(ReorderClubPhotosCommand command) {
        clubAuthService.requireEditableClubManager(command.requesterId(), command.clubId());

        List<ClubPhoto> current = clubPhotoRepository.findByClubId(command.clubId());
        Set<Long> currentIds = current.stream().map(ClubPhoto::getId).collect(Collectors.toSet());
        Set<Long> payloadIds = command.orders().stream()
                .map(PhotoOrder::photoId).collect(Collectors.toSet());

        if (!currentIds.equals(payloadIds)) {
            throw new ClubPhotoException.OrderMismatch();
        }

        // displayOrder 0..N-1 연속 검증
        int expected = current.size();
        Set<Integer> displayOrders = command.orders().stream()
                .map(PhotoOrder::displayOrder).collect(Collectors.toSet());
        if (displayOrders.size() != expected) {
            throw new ClubPhotoException.OrderMismatch();
        }
        for (int i = 0; i < expected; i++) {
            if (!displayOrders.contains(i)) {
                throw new ClubPhotoException.OrderMismatch();
            }
        }

        Map<Long, ClubPhoto> byId = current.stream().collect(Collectors.toMap(ClubPhoto::getId, p -> p));
        command.orders().forEach(order ->
                byId.get(order.photoId()).changeDisplayOrder(order.displayOrder()));

        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(command.clubId()).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long requesterId, Long photoId) {
        clubAuthService.requireEditableClubManager(requesterId, clubId);
        // 사진 행을 먼저 PESSIMISTIC_WRITE 로 잠근 뒤 참조 가드를 검사한다 — 대표 활동 등록/사진 교체와
        // 같은 사진 행을 두고 직렬화해 "가드 통과 → 등록 커밋 → 참조되는 사진 삭제" TOCTOU 를 차단한다.
        ClubPhoto photo = findPhotoInClubForUpdate(photoId, clubId);
        // 대표 활동이 참조 중인 사진은 삭제할 수 없다 — 먼저 대표 활동에서 해제해야 한다.
        if (clubHeroActivityRepository.existsByClubPhotoId(photoId)) {
            throw new ClubPhotoException.ReferencedByHeroActivity();
        }
        // 스펙 §3.2d: Storage 객체 정리는 별도 정리 잡(Phase 5)에서 처리한다.
        // 여기서는 DB 레코드만 soft-delete.
        clubPhotoRepository.delete(photo);
    }

    private ClubPhoto findPhotoInClub(Long photoId, Long clubId) {
        ClubPhoto photo = clubPhotoRepository.findById(photoId)
                .orElseThrow(ClubPhotoException.NotFound::new);
        if (!photo.getClub().getId().equals(clubId)) {
            throw new ClubPhotoException.NotInClub();
        }
        return photo;
    }

    // 삭제 경합 방지용 잠금 조회 — findPhotoInClub 과 동일하지만 사진 행에 PESSIMISTIC_WRITE 를 건다.
    private ClubPhoto findPhotoInClubForUpdate(Long photoId, Long clubId) {
        ClubPhoto photo = clubPhotoRepository.findByIdForUpdate(photoId)
                .orElseThrow(ClubPhotoException.NotFound::new);
        if (!photo.getClub().getId().equals(clubId)) {
            throw new ClubPhotoException.NotInClub();
        }
        return photo;
    }
}
