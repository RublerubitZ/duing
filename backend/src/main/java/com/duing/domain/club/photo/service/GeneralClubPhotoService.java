package com.duing.domain.club.photo.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.clubmember.service.ClubAuthService;
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

    @Override
    public List<ClubPhotoQuery> getPhotosByClubId(Long clubId) {
        return clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId).stream()
                .map(ClubPhotoQuery::from)
                .toList();
    }

    @Override
    @Transactional
    public ClubPhotoQuery create(CreateClubPhotoCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        int nextOrder = clubPhotoRepository.findMaxDisplayOrderByClubId(command.clubId()) + 1;
        ClubPhoto photo = ClubPhoto.create(
                club, command.storageKey(), command.caption(),
                command.width(), command.height(), nextOrder
        );
        return ClubPhotoQuery.from(clubPhotoRepository.save(photo));
    }

    @Override
    @Transactional
    public void updateCaption(UpdateClubPhotoCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());
        ClubPhoto photo = findPhotoInClub(command.photoId(), command.clubId());
        photo.updateCaption(command.caption());
    }

    @Override
    @Transactional
    public List<ClubPhotoQuery> reorder(ReorderClubPhotosCommand command) {
        clubAuthService.requireManager(command.requesterId(), command.clubId());

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
        clubAuthService.requireManager(requesterId, clubId);
        ClubPhoto photo = findPhotoInClub(photoId, clubId);
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
}
