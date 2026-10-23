package com.oneterm.common;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * float32 向量与 SQLite BLOB 互转及余弦相似度计算工具。
 */
public final class VectorUtils {

    private VectorUtils() {
    }

    public static byte[] toFloat32Blob(float[] vector) {
        if (vector == null || vector.length == 0) {
            return null;
        }
        ByteBuffer buffer = ByteBuffer.allocate(vector.length * Float.BYTES)
                .order(ByteOrder.LITTLE_ENDIAN);
        for (float v : vector) {
            buffer.putFloat(v);
        }
        return buffer.array();
    }

    public static float[] fromFloat32Blob(byte[] blob) {
        if (blob == null || blob.length == 0 || blob.length % Float.BYTES != 0) {
            return new float[0];
        }
        int len = blob.length / Float.BYTES;
        float[] vector = new float[len];
        ByteBuffer buffer = ByteBuffer.wrap(blob).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < len; i++) {
            vector[i] = buffer.getFloat();
        }
        return vector;
    }

    public static double cosineSimilarity(float[] a, float[] b) {
        if (a == null || b == null || a.length == 0 || b.length == 0) {
            return 0.0;
        }
        int len = Math.min(a.length, b.length);
        double dot = 0.0;
        double normA = 0.0;
        double normB = 0.0;
        for (int i = 0; i < len; i++) {
            dot += (double) a[i] * b[i];
            normA += (double) a[i] * a[i];
            normB += (double) b[i] * b[i];
        }
        if (normA < 1e-12 || normB < 1e-12) {
            return 0.0;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
