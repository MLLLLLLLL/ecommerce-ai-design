'use client';

import { useEffect, useSyncExternalStore } from 'react';

// ============================================
// sessionStorage 非敏感草稿同步 hook（V3 4.1）
// 使用 useSyncExternalStore 从外部存储恢复草稿，
// 避免 effect 中直接 setState 与 hydration 不一致。
// ============================================

interface DraftStore {
  snapshot: Record<string, unknown>;
  listeners: Set<() => void>;
}

const stores = new Map<string, DraftStore>();

function getStore(key: string): DraftStore {
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: {}, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

function readStorage(key: string): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function refreshSessionDraft(key: string): Record<string, unknown> {
  const store = getStore(key);
  store.snapshot = readStorage(key);
  for (const listener of store.listeners) listener();
  return store.snapshot;
}

export function writeSessionDraft(key: string, value: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略配额错误
  }
  const store = getStore(key);
  store.snapshot = value;
}

/**
 * 订阅指定 sessionStorage key 的草稿快照。
 * 服务端与首屏渲染返回空对象；挂载后调用方自行 refreshSessionDraft。
 */
export function useSessionDraft<T extends Record<string, unknown>>(key: string): Partial<T> {
  const store = getStore(key);
  const snapshot = useSyncExternalStore(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    () => store.snapshot as Partial<T>,
    () => ({}) as Partial<T>
  );

  useEffect(() => {
    refreshSessionDraft(key);
  }, [key]);

  return snapshot;
}
