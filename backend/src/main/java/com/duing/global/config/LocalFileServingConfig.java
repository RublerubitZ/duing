package com.duing.global.config;

import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 로컬 프로파일에서 업로드 디렉터리를 정적 리소스로 노출한다.
 * Supabase 프로파일에서는 객체 스토리지가 자체 URL 을 제공하므로 비활성.
 */
@Configuration
@Profile("local")
public class LocalFileServingConfig implements WebMvcConfigurer {

    private final String uploadDir;

    public LocalFileServingConfig(@Value("${file.upload-dir}") String uploadDir) {
        this.uploadDir = uploadDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = "file:" + Paths.get(uploadDir).toAbsolutePath().normalize() + "/";
        registry.addResourceHandler("/files/**").addResourceLocations(location);
    }
}
