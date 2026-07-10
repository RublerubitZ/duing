package com.duing.domain.user.service;

import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;
import com.duing.domain.user.support.PhoneMasker;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 행잠금이 필요한 MO 세션 쓰기(발급 upsert·인증 확정)를 <b>짧은 자체 트랜잭션</b>으로 감싼다.
 *
 * <p>오케스트레이터(GeneralPhoneVerificationService)가 트랜잭션을 갖지 않는 이유: Octomo 외부 콜
 * (타임아웃 최대 6초)이 트랜잭션 안에 있으면 폴링마다 DB 커넥션을 점유해 풀(운영 10개) 고갈 시
 * 무관한 API 까지 번진다. 또한 별도 트랜잭션 = 새 영속성 컨텍스트라, 확정 시 행잠금 조회가 항상
 * DB 의 신선한 상태를 읽어 무잠금 선조회의 1차 캐시 stale 문제(멱등 가드 무력화)가 원천 차단된다.
 */
@Component
@RequiredArgsConstructor
public class PhoneVerificationSessionManager {

    private final PhoneVerificationRepository phoneVerificationRepository;
    private final PhoneVerificationEventRepository phoneVerificationEventRepository;

    /** 번호당 1행 upsert — 행잠금으로 동시 발급의 쿨다운 우회·코드 덮어쓰기를 막는다 (spec §9.5). */
    @Transactional
    public PhoneVerification upsert(String phone, String token, VerificationPurpose purpose, LocalDateTime now) {
        PhoneVerification existingVerification =
                phoneVerificationRepository.findByPhoneForUpdate(phone).orElse(null);
        if (existingVerification != null) {
            if (existingVerification.isInCooldown(now)) {
                throw new PhoneVerificationException.PhoneVerificationCooldownException();
            }
            existingVerification.reissue(token, purpose, null, now);
            return existingVerification;
        }
        try {
            return phoneVerificationRepository.saveAndFlush(
                    PhoneVerification.issue(phone, token, purpose, null, now));
        } catch (DataIntegrityViolationException concurrentInsertRace) {
            // 동시 요청이 방금 행을 생성했다 — 쿨다운과 동일하게 응답하고 롤백한다.
            // (PostgreSQL 은 제약 위반 후 같은 트랜잭션에서 추가 쿼리 불가 → 재조회 금지)
            throw new PhoneVerificationException.PhoneVerificationCooldownException();
        }
    }

    /**
     * 수신 확인 후의 인증 확정 — 행잠금 + 신선한 로드(자체 트랜잭션) 상태에서 아직 PENDING 일 때만
     * 확정하고 VERIFIED 감사 이벤트를 남긴다 (멱등, spec §9.5). 최종 상태를 응답 형태로 반환한다.
     */
    @Transactional
    public PhoneVerificationStatusResult confirmIfPending(String verificationToken, String clientIp,
                                                          String userAgent) {
        // 외부(Octomo) 콜 지연 동안 시간이 흘렀을 수 있다 — 만료 판정·확정 시각은 잠금 시점에 재계산한다.
        LocalDateTime confirmedAt = LocalDateTime.now();
        PhoneVerification lockedVerification = phoneVerificationRepository
                .findByTokenForUpdate(verificationToken)
                .orElseThrow(PhoneVerificationException.PhoneVerificationNotFoundException::new);
        if (!lockedVerification.isVerified() && !lockedVerification.isExpired(confirmedAt)) {
            lockedVerification.markVerified(confirmedAt);
            phoneVerificationEventRepository.save(
                    PhoneVerificationEvent.verified(lockedVerification, clientIp, userAgent));
        }
        return new PhoneVerificationStatusResult(
                lockedVerification.status(confirmedAt),
                lockedVerification.remainingSeconds(confirmedAt),
                PhoneMasker.mask(lockedVerification.getPhone()));
    }
}
