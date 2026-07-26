package com.duing.domain.fee.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BankMatchingSetting;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.repository.BankMatchingSettingRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.query.BankMatchingClubResult;
import com.duing.domain.fee.service.dto.query.BankMatchingOverview;
import com.duing.domain.fee.support.AccountNumberMasker;
import com.duing.domain.fee.support.BankAccountAuditEvent;
import com.duing.domain.fee.support.BankCodeMapper;
import com.duing.global.bank.exception.BankApiException;
import com.duing.global.crypto.FeeAccountCipher;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link BankMatchingAdminService} 기본 구현체.
 *
 * <p><b>등록 = 총동연 허용 목록(로컬)</b>: 2026-07-17 제공사 개편으로 계좌 등록 절차가 폐지돼
 * ("별도의 계좌 등록 절차 없이 바로 조회할 수 있습니다" — 공식 문서) 외부에 등록할 대상이 없다.
 * 따라서 등록/해제는 어떤 동아리가 자동매칭을 쓸 수 있는지 정하는 DB 설정 변경일 뿐이다.
 * 개편 전 구현은 폐지된 {@code /v1/accounts} 를 계속 호출해 등록·해제·슬롯 조회가 404 로 실패했다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankMatchingAdminService implements BankMatchingAdminService {

    private final BankMatchingSettingRepository bankMatchingSettingRepository;
    private final FeeAccountRepository feeAccountRepository;
    private final ClubRepository clubRepository;
    private final BankCodeMapper bankCodeMapper;
    private final AccountNumberMasker accountNumberMasker;
    private final FeeAccountCipher feeAccountCipher;

    @Override
    @Transactional
    public void setActive(Long clubId, boolean active) {
        FeeAccount account = feeAccountRepository.findByClubId(clubId)   // 적격성 ①: 계좌 존재
                .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
        if (!bankCodeMapper.isEligible(account.getBank())) {            // 적격성 ②: 은행(NH/KB/우리/기업)
            throw new BankApiException.UnsupportedBankException();
        }
        if (!active) {
            // 설정이 없으면 이미 해제 상태다 — 끄기 위해 행을 새로 만들지 않는다(쓰레기 행 방지).
            bankMatchingSettingRepository.findByClubId(clubId).ifPresent(setting -> {
                setting.deactivate();
                log.info("bankAccountAudit event={} clubId={}",
                        BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTERED, clubId);
            });
            return;
        }
        BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId)
                .orElseGet(() -> bankMatchingSettingRepository.save(BankMatchingSetting.of(clubId)));
        setting.activate();
        log.info("bankAccountAudit event={} clubId={}",
                BankAccountAuditEvent.BANK_ACCOUNT_REGISTERED, clubId);
    }

    @Override
    @Transactional
    public void unregisterForAccountRemoval(Long clubId) {
        // 외부에 정리할 등록이 없으므로(제공사에 계좌 등록 개념 없음) 설정만 끈다.
        // 계좌가 사라진 동아리는 자동매칭을 쓸 수 없으니 설정을 남겨두지 않는다.
        bankMatchingSettingRepository.findByClubId(clubId).ifPresent(setting -> {
            setting.deactivate();
            bankMatchingSettingRepository.save(setting); // 비활성 영속을 코드에 명시(dirty checking 의존 X)
            log.info("bankAccountAudit event={} clubId={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTERED, clubId);
        });
    }

    @Override
    public BankMatchingOverview getMatchingClubs() {
        List<FeeAccount> accounts = feeAccountRepository.findAll();

        Map<Long, String> clubNamesById = clubRepository.findAllById(
                        accounts.stream().map(FeeAccount::getClubId).toList()).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, BankMatchingSetting> settingsByClubId =
                bankMatchingSettingRepository.findAll().stream()
                        .collect(Collectors.toMap(BankMatchingSetting::getClubId, Function.identity()));

        List<BankMatchingClubResult> clubs = accounts.stream()
                .map(account -> toClubResult(account, clubNamesById, settingsByClubId))
                .toList();

        // 등록 수는 방금 만든 목록에서 센다 — 외부 호출도 추가 쿼리도 없어 항상 목록과 일치한다.
        int registeredCount = (int) clubs.stream().filter(BankMatchingClubResult::registered).count();
        return new BankMatchingOverview(clubs, registeredCount);
    }

    private BankMatchingClubResult toClubResult(
            FeeAccount account,
            Map<Long, String> clubNamesById,
            Map<Long, BankMatchingSetting> settingsByClubId
    ) {
        boolean eligible = bankCodeMapper.isEligible(account.getBank());
        String ineligibleReason = eligible ? null : "지원하지 않는 은행입니다(농협·KB국민·우리·기업만 가능).";
        boolean registered = Optional.ofNullable(settingsByClubId.get(account.getClubId()))
                .map(BankMatchingSetting::isUsable)
                .orElse(false);
        String maskedAccountNumber = resolveMaskedAccountNumber(account);
        return new BankMatchingClubResult(
                account.getClubId(),
                clubNamesById.get(account.getClubId()),
                account.getBank(),
                account.getAccountHolder(),
                maskedAccountNumber,
                eligible,
                ineligibleReason,
                registered);
    }

    /**
     * 계좌번호를 복호화해 끝 4자리만 마스킹한다. 복호화 실패(키 회전·AAD 불일치·암호문 손상)는 그 행만
     * 비우도록 null 을 반환하고 경고 로그를 남긴다 — 페이지 전체를 죽이지 않는 graceful degrade.
     * 평문·암호문·키는 절대 로깅하지 않는다(clubId·원인만 남긴다).
     */
    private String resolveMaskedAccountNumber(FeeAccount account) {
        try {
            return accountNumberMasker.mask(
                    feeAccountCipher.decrypt(account.getAccountNumber(), account.getClubId()));
        } catch (IllegalArgumentException | IllegalStateException decryptFailure) {
            log.warn("bank-matching overview 계좌 복호화 실패 — 해당 행 마스킹 생략: clubId={}",
                    account.getClubId(), decryptFailure);
            return null;
        }
    }

    @Override
    public boolean isActiveUsable(Long clubId) {
        // 설정이 사용 불가하면 계좌 적격성은 볼 필요가 없다 — 기존 requireActiveUsable 의 평가 순서(설정 → 계좌)와
        // 동치를 유지하면서, 설정 미존재/미사용 시 불필요한 계좌 조회를 피하도록 단락 평가한다.
        boolean settingUsable = bankMatchingSettingRepository.findByClubId(clubId)
                .map(BankMatchingSetting::isUsable)
                .orElse(false);
        if (!settingUsable) {
            return false;
        }
        return feeAccountRepository.findByClubId(clubId)
                .map(FeeAccount::getBank)
                .map(bankCodeMapper::isEligible)
                .orElse(false);
    }

    @Override
    public void requireActiveUsable(Long clubId) {
        if (!isActiveUsable(clubId)) {
            throw new BankMatchingException.BankMatchingNotEnabledException();
        }
    }
}
