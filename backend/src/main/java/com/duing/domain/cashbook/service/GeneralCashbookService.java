package com.duing.domain.cashbook.service;

import com.duing.domain.cashbook.controller.dto.response.CashbookEntryResponse;
import com.duing.domain.cashbook.controller.dto.response.CashbookSummaryResponse;
import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.exception.CashbookEntryException;
import com.duing.domain.cashbook.repository.CashbookEntryRepository;
import com.duing.domain.cashbook.service.dto.command.CreateCashbookEntryCommand;
import com.duing.domain.cashbook.service.dto.command.UpdateCashbookEntryCommand;
import com.duing.domain.cashbook.service.dto.query.CashbookSearchQuery;
import com.duing.domain.clubmember.service.ClubAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralCashbookService implements CashbookService {

    private final CashbookEntryRepository cashbookEntryRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreateCashbookEntryCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        validateCategory(command.entryType(), command.categoryCode(), command.customCategory());
        CashbookEntry entry = CashbookEntry.createManual(command.clubId(), command.entryType(),
                command.categoryCode(), command.customCategory(), command.amount(),
                command.description(), command.transactionDate(), command.memo());
        return cashbookEntryRepository.save(entry).getId();
    }

    @Override
    @Transactional
    public void update(UpdateCashbookEntryCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        CashbookEntry entry = cashbookEntryRepository.findByIdAndClubId(command.entryId(), command.clubId())
                .orElseThrow(CashbookEntryException.CashbookEntryNotFoundException::new);
        validateCategory(entry.getEntryType(), command.categoryCode(), command.customCategory());
        if (entry.isBankApi()) {
            // BANK 자동 항목: 금액·설명·거래일은 불변 — 전송되면(잠긴 필드 변경 시도) 거부.
            if (command.amount() != null || command.description() != null || command.transactionDate() != null) {
                throw new CashbookEntryException.CashbookEntryImmutableException();
            }
            entry.updateCategoryAndMemo(command.categoryCode(), command.customCategory(), command.memo());
        } else {
            // MANUAL: 전체 수정 — 금액·설명·거래일 필수.
            if (command.amount() == null || command.description() == null || command.transactionDate() == null) {
                throw new CashbookEntryException.InvalidCashbookUpdateException();
            }
            entry.updateManual(command.categoryCode(), command.customCategory(), command.amount(),
                    command.description(), command.transactionDate(), command.memo());
        }
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long actorId, Long entryId) {
        clubAuthService.requireManager(actorId, clubId);
        CashbookEntry entry = cashbookEntryRepository.findByIdAndClubId(entryId, clubId)
                .orElseThrow(CashbookEntryException.CashbookEntryNotFoundException::new);
        if (entry.isBankApi()) {
            throw new CashbookEntryException.CashbookEntryNotDeletableException();
        }
        cashbookEntryRepository.delete(entry); // @SQLDelete soft delete
    }

    @Override
    public Page<CashbookEntryResponse> getEntries(Long clubId, Long actorId, CashbookSearchQuery query,
                                                  Pageable pageable) {
        clubAuthService.requireManager(actorId, clubId);
        return cashbookEntryRepository.search(clubId, query, pageable).map(CashbookEntryResponse::from);
    }

    @Override
    public CashbookSummaryResponse getSummary(Long clubId, Long actorId, CashbookSearchQuery query) {
        clubAuthService.requireManager(actorId, clubId);
        return CashbookSummaryResponse.from(cashbookEntryRepository.summarize(clubId, query));
    }

    // 카테고리 코드는 유형에 유효해야 하고, customCategory 는 OTHER 일 때만 채울 수 있다.
    private void validateCategory(CashbookEntryType entryType, CashbookCategory categoryCode, String customCategory) {
        boolean validForType = categoryCode.isValidFor(entryType);
        boolean customAllowed = categoryCode == CashbookCategory.OTHER || customCategory == null;
        if (!validForType || !customAllowed) {
            throw new CashbookEntryException.InvalidCashbookCategoryException();
        }
    }
}
