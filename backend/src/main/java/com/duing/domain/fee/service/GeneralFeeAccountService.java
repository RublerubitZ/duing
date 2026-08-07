package com.duing.domain.fee.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.exception.FeeAccountException;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.fee.service.dto.query.FeeAccountQuery;
import com.duing.global.crypto.FeeAccountCipher;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회비 계좌 등록·조회·삭제. 계좌번호는 절대 평문으로 영속화하지 않는다 —
 * 쓰기 경로에서는 {@link FeeAccountCipher#encrypt(String, long)} 로 암호화한 뒤 저장하고,
 * 읽기 경로에서는 응답을 만들 때만 {@link FeeAccountCipher#decrypt(String, long)} 로 복호화한다.
 * 암호문은 {@code clubId} 에 AAD 로 바인딩되므로 동아리 간 치환 시 복호화가 실패한다.
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
    private final BankMatchingAdminService bankMatchingAdminService;
    private final ClubAuditEventRepository clubAuditEventRepository;

    @Override
    @Transactional
    public Long upsert(UpsertFeeAccountCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 자동매칭이 사용 가능한(계좌 존재 + 사용 가능 설정 + 지원 은행) 동안에는 계좌를 잠근다 —
        // 활성 중 은행·번호가 바뀌면 이미 적재된 거래(bank_transaction.bank_code)와 귀속이 어긋난다.
        // 변경하려면 자동매칭을 먼저 해제해야 한다.
        // 계좌가 없는 최초 등록은 isActiveUsable=false 라 정상 통과한다.
        if (bankMatchingAdminService.isActiveUsable(command.clubId())) {
            throw new FeeAccountException.BankMatchingActiveException();
        }
        FeeAccount existingAccount = feeAccountRepository.findByClubId(command.clubId()).orElse(null);
        // 값이 하나도 달라지지 않은 저장은 갱신도 감사도 하지 않는다 — 운영진이 계좌 폼을 두 번 저장한 것뿐인데
        // FA-08(계좌 빈번 교체, 임계 2회·CRITICAL)이 수납 경로 변조로 경보하면 감사 콘솔을 못 믿게 된다.
        if (existingAccount != null && isSameAccount(existingAccount, command)) {
            return existingAccount.getId();
        }
        // 평문 계좌번호는 저장 직전에 암호화한다 — 영속 계층에는 암호문만 들어간다.
        // clubId 를 AAD 로 바인딩해 다른 동아리 행에 끼워 넣어도 복호화되지 않게 한다.
        String encryptedAccountNumber = feeAccountCipher.encrypt(command.accountNumber(), command.clubId());
        if (existingAccount != null) {
            existingAccount.update(command.bank(), encryptedAccountNumber, command.accountHolder());
            saveAccountAudit(ClubAuditEventType.FEE_ACCOUNT_UPDATED, command);
            return existingAccount.getId();
        }
        FeeAccount account = feeAccountRepository.save(FeeAccount.create(
                command.clubId(), command.bank(), encryptedAccountNumber, command.accountHolder()));
        saveAccountAudit(ClubAuditEventType.FEE_ACCOUNT_REGISTERED, command);
        return account.getId();
    }

    /** 계좌번호·예금주는 detail 에도 절대 싣지 않는다(스펙 §9) — 은행 코드만 남긴다. */
    private void saveAccountAudit(ClubAuditEventType eventType, UpsertFeeAccountCommand command) {
        clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                eventType, command.clubId(), command.actorId(),
                AuditDetailJson.of(Map.of("bank", command.bank().name()))));
    }

    /**
     * 저장하려는 값이 기존 계좌와 완전히 같은가. 암호문은 저장할 때마다 AEAD nonce 가 달라 서로 비교할 수 없으므로
     * 평문끼리 비교한다. 복호화가 실패하면(키 교체·손상) 같다고 단정할 수 없어 변경으로 취급한다 —
     * 여기서 예외를 던지면 계좌를 다시 등록해 복구하는 길까지 막힌다.
     */
    private boolean isSameAccount(FeeAccount existingAccount, UpsertFeeAccountCommand command) {
        if (existingAccount.getBank() != command.bank()
                || !command.accountHolder().equals(existingAccount.getAccountHolder())) {
            return false;
        }
        try {
            return command.accountNumber().equals(
                    feeAccountCipher.decrypt(existingAccount.getAccountNumber(), existingAccount.getClubId()));
        } catch (RuntimeException decryptionFailure) {
            // 평문·암호문·키는 절대 로깅하지 않는다 — clubId 와 원인만 남긴다.
            log.warn("기존 회비 계좌 복호화 실패 — 값 비교를 건너뛰고 변경으로 기록한다: clubId={}",
                    existingAccount.getClubId(), decryptionFailure);
            return false;
        }
    }

    @Override
    public FeeAccountQuery getForManager(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        return toDecryptedQuery(loadByClubId(clubId));
    }

    @Override
    public FeeAccountQuery getForMember(Long clubId, Long actorId) {
        clubAuthService.requireActiveMember(actorId, clubId);
        return toDecryptedQuery(loadByClubId(clubId));
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        FeeAccount account = loadByClubId(clubId);
        // 계좌가 사라진 동아리는 거래를 조회할 수 없으므로 자동매칭 설정을 함께 끈다.
        // 정리할 외부 등록이 없어 이 호출은 외부 장애로 실패하지 않는다(순서 무관하지만 의도를 드러내려 삭제 앞에 둔다).
        bankMatchingAdminService.unregisterForAccountRemoval(clubId);
        feeAccountRepository.delete(account); // @SQLDelete soft delete
        clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                ClubAuditEventType.FEE_ACCOUNT_DELETED, clubId, actorId, null));
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
        // clubId 는 NOT NULL 컬럼이라 정상 경로에서 null 일 수 없지만, AAD 언박싱 NPE 가
        // '복호화 실패'로 오인되지 않도록 명시적으로 가드한다(fail fast).
        if (clubId == null) {
            throw new IllegalStateException("복호화에 필요한 clubId 가 null 입니다.");
        }
        try {
            // 암호화 때와 같은 clubId 를 AAD 로 넘긴다 — 치환된 암호문이면 여기서 인증 실패한다.
            return feeAccountCipher.decrypt(encryptedAccountNumber, clubId);
        } catch (RuntimeException decryptionFailure) {
            // 평문·암호문·키는 절대 로깅하지 않는다 — clubId 와 원인만 남긴다.
            log.error("회비 계좌 복호화 실패: clubId={}", clubId, decryptionFailure);
            throw new FeeAccountException.AccountDecryptionFailedException(decryptionFailure);
        }
    }
}
