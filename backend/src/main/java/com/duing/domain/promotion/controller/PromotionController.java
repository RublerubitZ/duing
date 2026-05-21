package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.PromotionApi;
import com.duing.domain.promotion.controller.dto.response.PromotionCardResponse;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PromotionController implements PromotionApi {

    private final PromotionService promotionService;
    private final ClubRepository clubRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionCardResponse>>> listPublic(Pageable pageable) {
        Page<Promotion> page = promotionService.findPublic(pageable);

        Set<Long> clubIds = new HashSet<>();
        for (Promotion promotion : page.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));

        Page<PromotionCardResponse> mapped = page.map(promotion -> PromotionCardResponse.of(
                promotion,
                clubRef(promotion.getClubId(),
                        promotion.getClubId() == null ? null : clubMap.get(promotion.getClubId()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private PromotionCardResponse.ClubRef clubRef(Long clubId, Club club) {
        // 공개 응답에서는 삭제 노이즈를 노출하지 않는다 — clubId 가 있어도 row 가 사라졌으면 ref 를 숨김.
        if (clubId == null || club == null) return null;
        return new PromotionCardResponse.ClubRef(club.getId(), club.getName());
    }
}
