package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.exception.FeeAccountException;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.fee.service.dto.query.FeeAccountQuery;
import com.duing.global.crypto.FeeAccountCipher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회비 계좌 등록·조회·삭제. 계좌번호는 절대 평문으로 영속화하지 않는다 —
 * 쓰기 경로에서는 {@link FeeAccountCipher#encrypt(String)} 로 암호화한 뒤 저장하고,
 * 읽기 경로에서는 응답을 만들 때만 {@link FeeAccountCipher#decrypt(String)} 로 복호화한다.
 * 암호문·키는 로그/응답 어디에도 노출하지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeeAccountService implements FeeAccountService {

    private final FeeAccountRepository feeAccountRepository;
    private final ClubAuthService clubAuthService;
    private final FeeAccountCipher feeAccountCipher;

    @Override
    @Transactional
    public Long upsert(UpsertFeeAccountCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 평문 계좌번호는 저장 직전에 암호화한다 — 영속 계층에는 암호문만 들어간다.
        String encryptedAccountNumber = feeAccountCipher.encrypt(command.accountNumber());
        return feeAccountRepository.findByClubId(command.clubId())
                .map(existingAccount -> {
                    existingAccount.update(command.bank(), encryptedAccountNumber, command.accountHolder());
                    return existingAccount.getId();
                })
                .orElseGet(() -> {
                    FeeAccount account = FeeAccount.create(
                            command.clubId(), command.bank(), encryptedAccountNumber, command.accountHolder());
                    return feeAccountRepository.save(account).getId();
                });
    }

    @Override
    public FeeAccountQuery getForManager(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        return toDecryptedQuery(loadByClubId(clubId));
    }

    @Override
    public FeeAccountQuery getForMember(Long clubId, Long actorId) {
        clubAuthService.requireMember(actorId, clubId);
        return toDecryptedQuery(loadByClubId(clubId));
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        feeAccountRepository.delete(loadByClubId(clubId)); // @SQLDelete soft delete
    }

    private FeeAccount loadByClubId(Long clubId) {
        return feeAccountRepository.findByClubId(clubId)
                .orElseThrow(FeeAccountException.FeeAccountNotFoundException::new);
    }

    /** 응답 조립 시점에만 복호화한다. 복호화된 평문은 이 쿼리 밖으로 새지 않게 한다. */
    private FeeAccountQuery toDecryptedQuery(FeeAccount account) {
        return new FeeAccountQuery(
                account.getId(),
                account.getBank(),
                decryptAccountNumber(account.getClubId(), account.getAccountNumber()),
                account.getAccountHolder());
    }

    /**
     * 암호문을 복호화한다. 변조·키 불일치로 실패하면 평문/암호문/키를 메시지에 싣지 않는
     * 전용 예외로 변환하되, 원인 스택과 clubId 는 서버 로그에 남겨 at-rest 무결성 사건을 진단 가능하게 한다.
     */
    private String decryptAccountNumber(Long clubId, String encryptedAccountNumber) {
        try {
            return feeAccountCipher.decrypt(encryptedAccountNumber);
        } catch (RuntimeException decryptionFailure) {
            // 평문·암호문·키는 절대 로깅하지 않는다 — clubId 와 원인만 남긴다.
            log.error("회비 계좌 복호화 실패: clubId={}", clubId, decryptionFailure);
            throw new FeeAccountException.AccountDecryptionFailedException(decryptionFailure);
        }
    }
}
