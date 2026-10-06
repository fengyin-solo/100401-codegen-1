import { seedDispatchState } from './dispatch-seed'
import type { DispatchState } from './dispatch-types'

// 调度桌独立于业务台账单独持久化：改派痕迹、格子锁、交班单、快照、下发待办都在这里。
const STORAGE_KEY = 'underground-pipeline-inspection:dispatch'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): DispatchState {
  const fallback = seedDispatchState()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    // 新字段以后可能扩展，缺省字段用种子补齐
    return { ...fallback, ...(JSON.parse(raw) as Partial<DispatchState>) } as DispatchState
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: DispatchState | null = null

export function dispatchState(): DispatchState {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

/**
 * 事务式写入：mutate 在草稿上做全部修改，全部成功后一次性落库；
 * mutate 抛错或持久化失败（比如 localStorage 写满 / 测试开关），缓存保持原值，调用方拿到失败信息。
 */
export function commitDispatch(mutate: (draft: DispatchState) => void): { ok: boolean; message: string } {
  const draft = clone(dispatchState())
  try {
    mutate(draft)
    const serialized = JSON.stringify(draft)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, serialized)
    }
    cache = draft
    notify()
    return { ok: true, message: '' }
  } catch (error) {
    // 写入失败：不换 cache，本次所有改动（含锁定）都不生效
    return { ok: false, message: error instanceof Error ? error.message : '调度数据写入失败' }
  }
}

export function resetDispatch(): DispatchState {
  const fresh = seedDispatchState()
  cache = fresh
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  }
  notify()
  return fresh
}

export function dispatchStorageKey(): string {
  return STORAGE_KEY
}

// ---- 订阅：同页组件之间靠 notify；另一个标签页（另一值班人）靠 storage 事件同步 ----
type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeDispatch(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) {
      return
    }
    cache = null
    notify()
  })
}
