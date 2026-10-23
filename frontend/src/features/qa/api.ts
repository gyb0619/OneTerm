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

export interface QaHistoryItem {
  id: number;
  question: string;
  answer: string;
  retrievalMode: RetrievalMode;
  citations: QaCitationDto[];
  createdAt: string;
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

/**
 * 获取当前用户的问答历史记录
 */
export async function fetchQaHistory(limit = 50): Promise<QaHistoryItem[]> {
  return httpClient.get<QaHistoryItem[]>(`/api/qa/history?limit=${limit}`);
}

/**
 * 删除单条问答历史记录
 */
export async function deleteQaHistoryItem(id: number): Promise<void> {
  return httpClient.delete<void>(`/api/qa/history/${id}`);
}

/**
 * 清空当前用户的问答历史记录
 */
export async function clearQaHistory(): Promise<void> {
  return httpClient.delete<void>('/api/qa/history');
}
