import { httpClient } from '../../shared/api/httpClient';
import type { QaCitationDto } from '../../shared/types/api';

export type RetrievalMode = 'embedding' | 'bm25';

export interface QaIndexResponse {
  chunkCount: number;
  mode: RetrievalMode;
}

export interface QaAskDoneResult {
  answer: string;
  retrievalMode: RetrievalMode;
  citations: QaCitationDto[];
}

export const QUICK_QUESTIONS: readonly string[] = [
  '下周三有空吗？',
  '期末前哪几门最紧？',
  '本周有哪些时间冲突？',
] as const;

/**
 * 调用 POST /api/qa/index 重建当前登录用户的事件原文切片与向量索引
 */
export async function rebuildQaIndex(): Promise<QaIndexResponse> {
  return httpClient.post<QaIndexResponse>('/api/qa/index');
}
