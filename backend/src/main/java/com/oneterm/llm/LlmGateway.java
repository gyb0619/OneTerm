package com.oneterm.llm;

import java.util.List;

/**
 * 统一大模型网关接口。
 * 所有业务模块（extract、qa、visualize）的大模型调用只能经过此接口，不得自行发起外部请求。
 * 真实调用与额度统计由子代理 E 实现；当未配置有效模型或 ONETERM_MOCK=true 时自动走 MockLlmGateway。
 */
public interface LlmGateway {

    /**
     * 当前是否处于 Mock 模式（环境变量 ONETERM_MOCK=true 或数据库中无已启用的对话模型配置）。
     */
    boolean isMockMode();

    /**
     * 当前是否具备可用的向量模型（包含已启用 embedding 配置或处于支持模拟向量的 Mock 模式）。
     */
    boolean hasActiveEmbeddingModel();

    /**
     * 同步对话调用（用于非流式场景或内部重试）。
     */
    ChatResult chat(long userId, String kind, List<ChatMessage> messages);

    /**
     * 流式对话调用（逐字/分片回调 listener）。
     */
    void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener);

    /**
     * 识图模型调用：将图片转换为文本。
     */
    ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt);

    /**
     * 向量模型调用：将单段文本转换为 float32 向量。
     */
    float[] embed(long userId, String text);

    /**
     * 批量生成文本向量。
     */
    default List<float[]> embedBatch(long userId, List<String> texts) {
        return texts.stream().map(t -> embed(userId, t)).toList();
    }
}
