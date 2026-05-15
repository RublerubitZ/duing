package com.duing.global.file;

import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "supabase")
public class SupabaseStorageFileStorageService implements FileStorageService {

    private final String supabaseUrl;
    private final String serviceRoleKey;
    private final String bucket;
    private final RestTemplate restTemplate;

    public SupabaseStorageFileStorageService(
            @Value("${supabase.storage.url}") String supabaseUrl,
            @Value("${supabase.storage.service-role-key}") String serviceRoleKey,
            @Value("${supabase.storage.bucket}") String bucket) {
        if (!StringUtils.hasText(supabaseUrl) || !StringUtils.hasText(serviceRoleKey)) {
            throw new IllegalStateException(
                "Supabase Storage 사용 시 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
        }
        this.supabaseUrl = stripTrailingSlash(supabaseUrl);
        this.serviceRoleKey = serviceRoleKey;
        this.bucket = bucket;
        this.restTemplate = new RestTemplate();
    }

    @Override
    public String upload(MultipartFile file, String directory) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        String originalFilename = StringUtils.cleanPath(
                file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
        String extension = StringUtils.getFilenameExtension(originalFilename);
        String objectName = UUID.randomUUID() + (extension != null ? "." + extension : "");
        String objectPath = directory + "/" + objectName;

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceRoleKey);
        headers.add("apikey", serviceRoleKey);
        headers.setContentType(parseContentType(file.getContentType()));
        headers.add("x-upsert", "false");

        byte[] body;
        try {
            body = file.getBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("파일을 읽지 못했습니다.", exception);
        }

        String endpoint = supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath;
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    endpoint, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new IllegalStateException(
                    "Supabase Storage 업로드 실패: " + response.getStatusCode());
            }
        } catch (RestClientException exception) {
            throw new IllegalStateException("Supabase Storage 업로드에 실패했습니다.", exception);
        }

        return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + objectPath;
    }

    @Override
    public void delete(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return;
        }
        String prefix = supabaseUrl + "/storage/v1/object/public/" + bucket + "/";
        if (!fileUrl.startsWith(prefix)) {
            log.warn("Supabase 파일이 아닌 URL 삭제 요청 무시: {}", fileUrl);
            return;
        }
        String objectPath = fileUrl.substring(prefix.length());

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(serviceRoleKey);
        headers.add("apikey", serviceRoleKey);

        String endpoint = supabaseUrl + "/storage/v1/object/" + bucket + "/" + objectPath;
        try {
            restTemplate.exchange(endpoint, HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
        } catch (RestClientException exception) {
            log.warn("Supabase Storage 삭제 실패: {}", fileUrl, exception);
        }
    }

    private static MediaType parseContentType(String value) {
        if (value == null || value.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(value);
        } catch (Exception ignored) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
