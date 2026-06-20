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
import com.duing.domain.fee.support.BankCodeMapper;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.AccountSlotStatus;
import com.duing.global.bank.exception.BankApiException;
import com.duing.global.crypto.FeeAccountCipher;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link BankMatchingAdminService} 기본 구현체.
 *
 * <p><b>원자성(API-first)</b>: 자동매칭을 켜고 끌 때는 외부 BANK API 를 <em>먼저</em> 호출하고,
 * 그 호출이 성공한 경우에만 DB 설정을 변경한다. 외부 호출이 예외를 던지면 메서드가 그 자리에서 종료돼
 * 엔티티 변이가 실행되지 않으므로, DB 상태와 BANK API 상태가 어긋나는(state drift) 일이 없다.
 * 절대 "DB 먼저 변경 → API 호출" 순서로 뒤집지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankMatchingAdminService implements BankMatchingAdminService {

    private final BankMatchingSettingRepository bankMatchingSettingRepository;
    private final FeeAccountRepository feeAccountRepository;
    private final ClubRepository clubRepository;
    private final BankApiClient bankApiClient;
    private final BankCodeMapper bankCodeMapper;
    private final AccountNumberMasker accountNumberMasker;
    private final FeeAccountCipher feeAccountCipher;

    @Override
    @Transactional
    public void setActive(Long clubId, boolean active) {
        FeeAccount account = feeAccountRepository.findByClubId(clubId)   // 적격성 ①: 계좌 존재
                .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
        if (!bankCodeMapper.isEligible(account.getBank())) {            // 적격성 ②: 은행(NH/KB/우리)
            throw new BankApiException.UnsupportedBankException();
        }
        BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId)
                .orElseGet(() -> bankMatchingSettingRepository.save(BankMatchingSetting.of(clubId)));
        String bankCode = bankCodeMapper.toApiCode(account.getBank());
        // 복호화 실패(키 회전·AAD 불일치·암호문 손상)는 외부 BANK API 호출 전에 도메인 예외로 매핑한다 —
        // 불투명한 500 으로 새지 않게 하되, 암호·PII 세부정보는 메시지에 절대 싣지 않는다.
        String accountNumber;
        try {
            accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), clubId);
        } catch (RuntimeException decryptFailure) {
            throw new BankMatchingException.AccountDecryptFailedException();
        }
        if (active) {
            bankApiClient.registerAccount(bankCode, accountNumber);     // ① 외부 등록(실패 시 예외 → 아래 DB 반영 안 됨)
            setting.activate();                                         // ② 성공 시에만 DB
        } else {
            bankApiClient.deleteAccount(bankCode, accountNumber);       // ① 외부 해제
            setting.deactivate();                                      // ②
        }
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

        // 슬롯 현황은 외부 BANK API 호출이 필요하다. 일시 장애로 실패해도 외부 호출이 필요 없는
        // 동아리 목록은 그대로 반환해야 하므로, 실패 시 슬롯만 비우고(null) 페이지를 살린다(graceful degrade).
        AccountSlotStatus slots;
        try {
            slots = bankApiClient.getAccountStatus();
        } catch (RuntimeException bankApiDown) {
            slots = null; // BANK API 일시 장애 — 슬롯 현황만 비우고 동아리 목록은 정상 반환
        }
        return new BankMatchingOverview(clubs, slots);
    }

    private BankMatchingClubResult toClubResult(
            FeeAccount account,
            Map<Long, String> clubNamesById,
            Map<Long, BankMatchingSetting> settingsByClubId
    ) {
        boolean eligible = bankCodeMapper.isEligible(account.getBank());
        String ineligibleReason = eligible ? null : "지원하지 않는 은행입니다(농협·KB국민·우리만 가능).";
        boolean registered = Optional.ofNullable(settingsByClubId.get(account.getClubId()))
                .map(BankMatchingSetting::isUsable)
                .orElse(false);
        // 계좌번호는 복호화해 끝 4자리만 마스킹한다. 한 계좌의 복호화가 실패해도(키 회전·암호문 손상)
        // 그 행만 maskedAccountNumber=null 로 비우고 페이지는 정상 반환한다(graceful degrade).
        String maskedAccountNumber;
        try {
            maskedAccountNumber = accountNumberMasker.mask(
                    feeAccountCipher.decrypt(account.getAccountNumber(), account.getClubId()));
        } catch (RuntimeException decryptFailure) {
            maskedAccountNumber = null;
        }
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
