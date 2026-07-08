package com.duing.global.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Spring MVC 표준 요청 오류(필수 파라미터·요청 항목 누락, 미지원 메서드·미디어 타입)가 catch-all(500)
 * 이 아니라 올바른 4xx 와 한국어 안내로 응답하는지 검증. 500 으로 흘러가면 클라이언트 요청 오류가
 * Sentry ERROR 로 잘못 승격되어 알림 노이즈가 된다.
 */
class GlobalExceptionHandlerStandardRequestErrorsTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new RequestErrorStubController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("필수 요청 파라미터가 빠지면 500 이 아니라 400 과 파라미터명 안내로 응답한다")
    void missingRequiredParameterMapsTo400() throws Exception {
        mockMvc.perform(get("/req-error/param"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message").value("필수 요청 파라미터 'q' 가 없습니다."));
    }

    @Test
    @DisplayName("필수 멀티파트 항목이 빠지면 500 이 아니라 400 과 항목명 안내로 응답한다")
    void missingRequiredPartMapsTo400() throws Exception {
        mockMvc.perform(multipart("/req-error/part"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message").value("필수 요청 항목 'file' 가 없습니다."));
    }

    @Test
    @DisplayName("지원하지 않는 HTTP 메서드로 요청하면 500 이 아니라 405 와 Allow 헤더로 응답한다")
    void unsupportedMethodMapsTo405WithAllowHeader() throws Exception {
        mockMvc.perform(post("/req-error/get-only"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.ok").value(false))
                // RFC 9110 — 405 는 허용 메서드를 Allow 헤더로 알려야 한다(여기선 GET).
                .andExpect(header().string("Allow", Matchers.containsString("GET")));
    }

    @Test
    @DisplayName("지원하지 않는 미디어 타입으로 요청하면 500 이 아니라 415 로 응답한다")
    void unsupportedMediaTypeMapsTo415() throws Exception {
        mockMvc.perform(post("/req-error/json-only")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("본문"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.ok").value(false));
    }

    @RestController
    static class RequestErrorStubController {

        @GetMapping("/req-error/param")
        String requiresParam(@RequestParam("q") String query) {
            return query;
        }

        @PostMapping("/req-error/part")
        String requiresPart(@RequestPart("file") MultipartFile file) {
            return "ok";
        }

        @GetMapping("/req-error/get-only")
        String getOnly() {
            return "ok";
        }

        @PostMapping(value = "/req-error/json-only", consumes = MediaType.APPLICATION_JSON_VALUE)
        String jsonOnly(@RequestBody String body) {
            return body;
        }
    }
}
