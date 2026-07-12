package com.duing.domain.notification.service;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import com.duing.domain.notice.broadcast.exception.NoticeBroadcastException;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastReadRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepositoryCustom.BroadcastSlice;
import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.service.dto.query.NotificationQuery;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralNotificationService implements NotificationService {

    // 개인·공지 알림 병합용 over-fetch 상한. 이 병합 방식은 각 소스에서 (pageNumber+1)*pageSize 만큼을
    // 가져와 정렬 후 잘라내야 정확하므로, 그 요청량이 이 상한을 넘는 깊은 페이지는 정확히 서빙할 수 없다 —
    // 그런 페이지는 결정론적으로 빈 목록을 반환한다(잘못된 슬라이스 대신). 이 상한은 대량 조회로 인한
    // 메모리 부하도 함께 막는다. 정상 사용자의 알림 수는 이 값보다 훨씬 적어 실제로 이 경계에 닿지 않는다.
    private static final int MAX_MERGE_FETCH = 5000;

    private final NotificationRepository notificationRepository;
    private final NoticeBroadcastRepository broadcastRepository;
    private final NoticeBroadcastReadRepository broadcastReadRepository;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean createIfAbsent(CreateNotificationCommand command) {
        if (notificationRepository.existsByUserIdAndDedupKey(command.userId(), command.dedupKey())) {
            return false;
        }
        Notification notification = Notification.create(
                command.userId(),
                command.type(),
                command.title(),
                command.body(),
                command.linkUrl(),
                command.payload(),
                command.dedupKey()
        );
        try {
            notificationRepository.saveAndFlush(notification);
            return true;
        } catch (DataIntegrityViolationException collision) {
            return false;
        }
    }

    @Override
    public Page<NotificationResponse> listMine(Long userId, boolean unreadOnly, Pageable pageable) {
        // 개인·공지 알림을 각각 over-fetch 해 메모리에서 병합·정렬한 뒤 요청 페이지를 잘라낸다. 정확히
        // 서빙하려면 각 소스에서 (pageNumber+1)*pageSize(=requestedFetch) 만큼 가져와야 한다. 이 계산과
        // offset 은 long 으로 해 큰 page 번호에서의 int 오버플로(음수 size → PageRequest 예외)를 피한다.
        // requestedFetch 가 상한을 넘으면 정확히 서빙할 수 없으므로 아래에서 빈 목록으로 단락한다.
        long requestedFetch = ((long) pageable.getPageNumber() + 1) * pageable.getPageSize();

        // 요청 깊이가 정확히 서빙 가능한 상한을 넘으면, capped over-fetch 를 잘못 잘라 다른 레코드를 내보내는
        // 대신 결정론적으로 빈 목록을 반환한다(totalElements 는 실제 총계 그대로 노출). 버릴 대량 content
        // 조회를 피하려 총계만 계산한다 — 개인 알림 총계는 size 1 조회의 count 로 얻는다.
        if (requestedFetch > MAX_MERGE_FETCH) {
            long personalTotal = notificationRepository
                    .findMine(userId, unreadOnly, PageRequest.of(0, 1, Sort.by(Sort.Direction.DESC, "createdAt")))
                    .getTotalElements();
            return new PageImpl<>(List.of(), pageable, personalTotal + broadcastTotal(userId, unreadOnly));
        }
        int overFetch = (int) requestedFetch; // 위 가드로 requestedFetch <= MAX_MERGE_FETCH → int 캐스팅 안전

        // personal: 기존 repo 사용. unreadOnly 는 기존 시그니처가 처리.
        Page<Notification> personalPage = notificationRepository
                .findMine(userId, unreadOnly, PageRequest.of(0, overFetch, Sort.by(Sort.Direction.DESC, "createdAt")));
        long personalTotal = personalPage.getTotalElements();
        List<NotificationResponse> personal = personalPage.getContent().stream()
                .map(NotificationQuery::from)
                .map(NotificationResponse::from)
                .toList();

        // broadcast: 항상 over-fetch, isRead 필터는 union 단계에서.
        List<BroadcastSlice> broadcastSlices = broadcastRepository.findSliceForUser(userId, overFetch);
        List<NotificationResponse> broadcast = broadcastSlices.stream()
                .filter(slice -> !unreadOnly || !slice.isRead())
                .map(slice -> NotificationResponse.fromBroadcast(slice.broadcast(), slice.isRead()))
                .toList();
        long broadcastTotal = broadcastTotal(userId, unreadOnly);

        // merge + sort (null-safe: createdAt 이 null 이면 맨 뒤로)
        List<NotificationResponse> merged = new ArrayList<>(personal.size() + broadcast.size());
        merged.addAll(personal);
        merged.addAll(broadcast);
        merged.sort(Comparator
                .comparing(NotificationResponse::createdAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .reversed());

        // page slice — offset 은 long 으로 비교해 int 캐스팅 오버플로를 피한다. 병합 목록 범위 밖이면 빈 목록.
        long start = pageable.getOffset();
        List<NotificationResponse> pageContent = start >= merged.size()
                ? List.of()
                : merged.subList((int) start, (int) Math.min(start + pageable.getPageSize(), merged.size()));
        return new PageImpl<>(pageContent, pageable, personalTotal + broadcastTotal);
    }

    private long broadcastTotal(Long userId, boolean unreadOnly) {
        return unreadOnly
                ? broadcastRepository.countUnreadForUser(userId)
                : broadcastRepository.countWithinRetention(); // 노출 기간(30일) 이내 공지만 집계
    }

    @Override
    public long unreadCount(Long userId) {
        long personal = notificationRepository.countUnreadWithinRetention(userId);
        long broadcast = broadcastRepository.countUnreadForUser(userId);
        return personal + broadcast;
    }

    @Override
    @Transactional
    public void markRead(Long userId, Long notificationId) {
        notificationRepository.findByIdAndUserId(notificationId, userId)
                .ifPresent(Notification::markRead);
    }

    @Override
    @Transactional
    public void markAllRead(Long userId) {
        notificationRepository.markAllRead(userId);
    }

    @Override
    @Transactional
    public void markBroadcastRead(Long userId, Long broadcastId) {
        if (!broadcastRepository.existsById(broadcastId)) {
            throw new NoticeBroadcastException.NoticeBroadcastNotFoundException();
        }
        if (broadcastReadRepository.existsByIdBroadcastIdAndIdUserId(broadcastId, userId)) {
            return; // 멱등
        }
        broadcastReadRepository.save(new NoticeBroadcastRead(broadcastId, userId));
    }
}
