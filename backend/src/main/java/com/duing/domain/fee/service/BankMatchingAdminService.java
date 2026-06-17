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
 * 총동연(ADMIN)이 동아리별 BANK 자동매칭을 허용/해제한다.
 *
 * <p><b>원자성(API-first)</b>: 자동매칭을 켜고 끌 때는 외부 BANK API 를 <em>먼저</em> 호출하고,
 * 그 호출이 성공한 경우에만 DB 설정을 변경한다. 외부 호출이 예외를 던지면 메서드가 그 자리에서 종료돼
 * 엔티티 변이가 실행되지 않으므로, DB 상태와 BANK API 상태가 어긋나는(state drift) 일이 없다.
 * 절대 "DB 먼저 변경 → API 호출" 순서로 뒤집지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BankMatchingAdminService {

    private final BankMatchingSettingRepository bankMatchingSettingRepository;
    private final FeeAccountRepository feeAccountRepository;
    private final ClubRepository clubRepository;
    private final BankApiClient bankApiClient;
    private final BankCodeMapper bankCodeMapper;
    private final FeeAccountCipher feeAccountCipher;

    /**
     * 동아리의 BANK 자동매칭을 허용(active=true)하거나 해제(active=false)한다.
     *
     * <p>적격성 검증(① 회비 계좌 존재, ② 지원 은행)을 통과한 뒤, 외부 BANK API 등록/해제를 먼저 호출하고
     * 성공 시에만 설정 엔티티를 변이한다. 등록 실패(한도 초과·인증 실패 등) 시 예외가 전파되며 DB 는 그대로다.
     */
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
        String accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), clubId);
        if (active) {
            bankApiClient.registerAccount(bankCode, accountNumber);     // ① 외부 등록(실패 시 예외 → 아래 DB 반영 안 됨)
            setting.activate();                                         // ② 성공 시에만 DB
        } else {
            bankApiClient.deleteAccount(bankCode, accountNumber);       // ① 외부 해제
            setting.deactivate();                                      // ②
        }
    }

    /**
     * 자동매칭 관리 화면용 조회. 회비 계좌가 등록된 동아리들의 적격·등록 상태와,
     * 인증 키 전역의 계좌 슬롯 현황을 함께 반환한다.
     */
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

        AccountSlotStatus slots = bankApiClient.getAccountStatus();
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
        return new BankMatchingClubResult(
                account.getClubId(),
                clubNamesById.get(account.getClubId()),
                eligible,
                ineligibleReason,
                registered);
    }

    /**
     * 자동매칭이 실제로 동작 가능한지 검증한다. 설정이 사용 가능(active && api_registered) 상태가 아니거나
     * 계좌 은행이 지원 대상이 아니면 예외를 던진다. 다른 도메인(BE-4 청구 매칭·BE-6 정산)에서 재사용한다.
     */
    public void requireActiveUsable(Long clubId) {
        BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId)
                .orElseThrow(BankMatchingException.BankMatchingNotEnabledException::new);
        boolean bankEligible = feeAccountRepository.findByClubId(clubId)
                .map(FeeAccount::getBank)
                .map(bankCodeMapper::isEligible)
                .orElse(false);
        if (!setting.isUsable() || !bankEligible) {
            throw new BankMatchingException.BankMatchingNotEnabledException();
        }
    }
}
