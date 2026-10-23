package com.oneterm.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM 密钥加解密与脱敏工具。
 * 主密钥来自环境变量 ONETERM_SECRET_KEY（oneterm.secret-key），经 SHA-256 派生为 256-bit 密钥。
 */
@Component
public class AesGcmCrypto {

    private static final String CIPHER_ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecretKeySpec secretKeySpec;
    private final SecureRandom secureRandom = new SecureRandom();

    public AesGcmCrypto(@Value("${oneterm.secret-key:dev-only-oneterm-aes256-secret-key-32b}") String masterSecret) {
        String effectiveSecret = (masterSecret == null || masterSecret.isBlank())
                ? "dev-only-oneterm-aes256-secret-key-32b"
                : masterSecret;
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = sha256.digest(effectiveSecret.getBytes(StandardCharsets.UTF_8));
            this.secretKeySpec = new SecretKeySpec(keyBytes, "AES");
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to initialize AES-256-GCM key", ex);
        }
    }

    /**
     * 使用 AES-256-GCM 加密明文 API Key，输出 Base64(12字节IV + 密文与Tag)。
     */
    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            throw new IllegalArgumentException("API Key 不能为空");
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKeySpec, spec);

            byte[] cipherBytes = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            ByteBuffer buffer = ByteBuffer.allocate(iv.length + cipherBytes.length);
            buffer.put(iv);
            buffer.put(cipherBytes);
            return Base64.getEncoder().encodeToString(buffer.array());
        } catch (Exception ex) {
            throw new IllegalStateException("AES-256-GCM encryption failed", ex);
        }
    }

    /**
     * 解密 Base64 编码的 AES-256-GCM 密文。
     */
    public String decrypt(String encryptedBase64) {
        if (encryptedBase64 == null || encryptedBase64.isBlank()) {
            throw new IllegalArgumentException("加密密文不能为空");
        }
        try {
            byte[] combined = Base64.getDecoder().decode(encryptedBase64);
            if (combined.length <= IV_LENGTH_BYTES) {
                throw new IllegalArgumentException("无效的加密数据格式");
            }
            byte[] iv = new byte[IV_LENGTH_BYTES];
            byte[] cipherBytes = new byte[combined.length - IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH_BYTES);
            System.arraycopy(combined, IV_LENGTH_BYTES, cipherBytes, 0, cipherBytes.length);

            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKeySpec, spec);

            byte[] plainBytes = cipher.doFinal(cipherBytes);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("AES-256-GCM decryption failed", ex);
        }
    }

    /**
     * 将明文 API Key 转换为仅展示末 4 位的脱敏字符串（如 ****8f2a），绝不暴露完整 Key。
     */
    public static String maskApiKey(String plainApiKey) {
        if (plainApiKey == null || plainApiKey.isBlank()) {
            return "****";
        }
        String trimmed = plainApiKey.trim();
        if (trimmed.length() <= 4) {
            return "****";
        }
        return "****" + trimmed.substring(trimmed.length() - 4);
    }

    /**
     * 解密密文并仅返回脱敏尾号。
     */
    public String maskEncryptedApiKey(String encryptedBase64) {
        if (encryptedBase64 == null || encryptedBase64.isBlank()) {
            return "****";
        }
        try {
            String plain = decrypt(encryptedBase64);
            return maskApiKey(plain);
        } catch (Exception ex) {
            return "****";
        }
    }
}
