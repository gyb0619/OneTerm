import { useCallback, useRef, useState } from 'react';
import { getCsrfTokenFromCookie } from '../api/httpClient';
import type {
  ApiError,
  SseDeltaEvent,
  SseDoneEvent,
  SseProgressEvent,
} from '../types/api';

export interface SseStreamCallbacks<TResult = unknown> {
  onProgress?: (progress: SseProgressEvent) => void;
  onDelta?: (delta: string, accumulated: string) => void;
  onDone?: (done: SseDoneEvent<TResult>) => void;
  onError?: (error: ApiError) => void;
}

export interface UseSseStreamReturn<TResult = unknown> {
  streaming: boolean;
  progress: SseProgressEvent | null;
  accumulatedText: string;
  error: ApiError | null;
  startStream: (
    url: string,
    body?: unknown,
    callbacks?: SseStreamCallbacks<TResult>
  ) => Promise<void>;
  abortStream: () => void;
}

/**
 * 统一 SSE 流式订阅 Hook。
 * 支持 POST 请求与自动携带 CSRF 请求头，严格解析 CONVENTIONS.md 约定的四类事件：
 * progress / delta / done / error
 */
export function useSseStream<TResult = unknown>(): UseSseStreamReturn<TResult> {
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState<SseProgressEvent | null>(null);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startStream = useCallback(
    async (
      url: string,
      body?: unknown,
      callbacks?: SseStreamCallbacks<TResult>
    ) => {
      abortStream();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStreaming(true);
      setProgress(null);
      setAccumulatedText('');
      setError(null);

      const headers = new Headers({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      });
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers.set('X-XSRF-TOKEN', csrfToken);
      }

      try {
        const response = await fetch(url, {
          method: body !== undefined ? 'POST' : 'GET',
          headers,
          credentials: 'include',
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let errPayload: ApiError = {
            code: `HTTP_${response.status}`,
            message: `流式请求失败 (${response.status})`,
          };
          try {
            const json = (await response.json()) as Partial<ApiError>;
            if (json?.message) {
              errPayload = {
                code: json.code || errPayload.code,
                message: json.message,
              };
            }
          } catch {
            // 忽略解析异常
          }
          setError(errPayload);
          callbacks?.onError?.(errPayload);
          setStreaming(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            if (!block.trim()) continue;
            let eventName = 'message';
            const dataLines: string[] = [];

            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }

            const rawData = dataLines.join('\n');
            if (!rawData) continue;

            try {
              const parsed = JSON.parse(rawData);
              if (eventName === 'progress') {
                const prog = parsed as SseProgressEvent;
                setProgress(prog);
                callbacks?.onProgress?.(prog);
              } else if (eventName === 'delta') {
                const delta = (parsed as SseDeltaEvent).content || '';
                fullText += delta;
                setAccumulatedText(fullText);
                callbacks?.onDelta?.(delta, fullText);
              } else if (eventName === 'done') {
                const donePayload = parsed as SseDoneEvent<TResult>;
                callbacks?.onDone?.(donePayload);
              } else if (eventName === 'error') {
                const errPayload = parsed as ApiError;
                setError(errPayload);
                callbacks?.onError?.(errPayload);
              }
            } catch {
              // 忽略非 JSON 心跳行
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const fallbackErr: ApiError = {
            code: 'STREAM_INTERRUPTED',
            message: (err as Error).message || '流式连接中断，请点击重试',
          };
          setError(fallbackErr);
          callbacks?.onError?.(fallbackErr);
        }
      } finally {
        setStreaming(false);
      }
    },
    [abortStream]
  );

  return {
    streaming,
    progress,
    accumulatedText,
    error,
    startStream,
    abortStream,
  };
}
