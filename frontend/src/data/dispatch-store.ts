import { MODULES } from './modules'
import { SEED_ROWS } from './seed'
import type { DispatchDeskState, DispatchItem, DispatchModuleKey } from './dispatch-types'

// 汛前调度桌单独存一份：调度板、网格锁、改派留痕、交接班快照都在这个键下，
// 与各业务模块的 entries 互不影响。
const STORAGE_KEY = 'underground-pipeline-inspection:dispatch-desk'

// 运营概览要铺开的五类事项：管线、巡检、缺陷、泵站、应急。
export const DESK_MODULES: DispatchModuleKey[] = ['pipeline', 'inspection', 'defect', 'pump_station', 'emergency']

export const DESK_GRIDS = ['城东网格', '城西网格', '城南网格', '城北网格']

export const GRID_OWNERS: Record<string, string> = {
  城东网格: '张工',
  城西网格: '李工',
  城南网格: '王工',
  城北网格: '赵工',
}

// 小时刻度：06:00 到 21:00，覆盖汛前值班的主要时段。
export const DESK_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

// 值班人名册：运营概览上切换值班人，用来模拟两名负责人抢同一格的场景。
export const DUTY_ROSTER = ['值班管理员', '张工', '李工', '王工', '赵工']

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedItems(): DispatchItem[] {
  const items: DispatchItem[] = []
  DESK_MODULES.forEach((key, moduleIdx) => {
    const meta = MODULES.find((item) => item.key === key)
    if (!meta) {
      return
    }
    const rows = SEED_ROWS[key] ?? []
    rows.forEach((row, rowIdx) => {
      const grid = DESK_GRIDS[(moduleIdx + rowIdx) % DESK_GRIDS.length]
      items.push({
        id: `${key}-${row.id}`,
        moduleKey: key,
        moduleName: meta.name,
        entryId: Number(row.id),
        title: `${meta.name}·${row[meta.fields[0]] ?? row.id}`,
        grid,
        hour: DESK_HOURS[(moduleIdx * 2 + rowIdx * 3) % DESK_HOURS.length],
        kind: row.abnormal ? '异常' : '待办',
        assignee: GRID_OWNERS[grid],
      })
    })
  })
  return items
}

function seedState(): DispatchDeskState {
  return {
    round: 1,
    items: seedItems(),
    locks: [],
    reassigns: [],
    handovers: [],
    moduleTodos: { pipeline: [], inspection: [], defect: [], pump_station: [], emergency: [] },
  }
}

let cache: DispatchDeskState | null = null

export function loadDeskState(): DispatchDeskState {
  if (cache !== null) {
    return cache
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    cache = seedState()
    return cache
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    cache = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    return cache
  }
  try {
    cache = { ...seedState(), ...(JSON.parse(raw) as DispatchDeskState) }
    return cache
  } catch {
    cache = seedState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    return cache
  }
}

export function saveDeskState(state: DispatchDeskState): void {
  // 先写本地存储再换缓存：写不进去时内存里也不换，调用方看到的还是旧状态。
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  cache = state
}

export function resetDeskState(): DispatchDeskState {
  const state = seedState()
  saveDeskState(state)
  return state
}

export function cloneDeskState(state: DispatchDeskState): DispatchDeskState {
  return clone(state)
}
