'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PromptOptimizeMode = 'text-to-image' | 'image-to-image';

const OPTIMIZE_TIMEOUT_MS = 30_000;

/**
 * 提示词优化 hook
 * 管理优化弹窗状态、流式请求与超时取消
 */
export function usePromptOptimize() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedText, setOptimizedText] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timedOutRef = useRef(false);

  /**
   * 清理定时器与中断句柄
   */
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 组件卸载时中断进行中的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanup();
    };
  }, [cleanup]);

  /**
   * 发起流式优化请求
   * @param modelId 服务端保存的文本模型 ID
   * @param prompt 用户原始提示词
   * @param mode 优化模式（文生图/图生图）
   * @param image 图生图模式的参考图（URL或dataUrl）
   */
  const optimize = useCallback(
    async (
      modelId: string,
      prompt: string,
      mode: PromptOptimizeMode,
      image?: string
    ) => {
      // 清理上一次请求
      abortRef.current?.abort();
      cleanup();

      const controller = new AbortController();
      abortRef.current = controller;
      timedOutRef.current = false;

      setOriginalPrompt(prompt);
      setOptimizedText('');
      setError(null);
      setOptimizing(true);
      setDialogOpen(true);

      // 30秒超时
      timeoutRef.current = setTimeout(() => {
        timedOutRef.current = true;
        controller.abort();
      }, OPTIMIZE_TIMEOUT_MS);

      try {
        const response = await fetch('/api/ai/optimize-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId, prompt, mode, image }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = `请求失败 (${response.status})`;
          try {
            const data = await response.json();
            if (data.error) message = data.error;
          } catch {
            // 非JSON响应
          }
          throw new Error(message);
        }

        if (!response.body) {
          throw new Error('响应没有可读流');
        }

        // 解析SSE流：逐行读取 data: 事件，累加 delta.content
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                setOptimizedText((prev) => prev + delta);
              }
            } catch {
              // 忽略无法解析的行
            }
          }
        }

        setOptimizing(false);
      } catch (err) {
        if (controller.signal.aborted) {
          // 用户取消：静默处理；超时：提示错误
          if (timedOutRef.current) {
            setError('优化请求超时，请稍后重试');
            setOptimizing(false);
          }
          return;
        }
        setError(err instanceof Error ? err.message : '提示词优化失败');
        setOptimizing(false);
      } finally {
        cleanup();
      }
    },
    [cleanup]
  );

  /**
   * 取消优化：中断请求并重置状态
   */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cleanup();
    setOptimizing(false);
    setOptimizedText('');
    setError(null);
  }, [cleanup]);

  /**
   * 接受优化结果：返回优化后的文本并重置状态
   */
  const accept = useCallback(() => {
    const text = optimizedText;
    abortRef.current = null;
    setOptimizedText('');
    setError(null);
    return text;
  }, [optimizedText]);

  return {
    dialogOpen,
    setDialogOpen,
    optimizing,
    optimizedText,
    originalPrompt,
    error,
    optimize,
    accept,
    cancel,
  };
}
