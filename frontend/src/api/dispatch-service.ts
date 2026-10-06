import {
  DESK_GRIDS,
  DESK_HOURS,
  GRID_OWNERS,
  cloneDeskState,
  loadDeskState,
  saveDeskState,
} from '@/data/dispatch-store'
import type {
  DispatchDeskState,
  GridLock,
  HandoverSlip,
  ModuleTodo,
  ReassignRecord,
} from '@/data/dispatch-types'
import type { ActionResult } from '@/data/types'

export type DeskView = {
  state: DispatchDeskState
  grids: string[]
  hours: number[]
  gridOwners: Record<string, string>
}

export type ReassignInput = {
  itemId: string
  toGrid: string
  toHour: number
  toAssignee: string
  reason: string
  operator: string
}

export type ReassignResult = ActionResult & { conflict: boolean }

function now(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function loadDesk(): DeskView {
  return { state: loadDeskState(), grids: DESK_GRIDS, hours: DESK_HOURS, gridOwners: GRID_OWNERS }
}

export function lockOfGrid(state: DispatchDeskState, grid: string): GridLock | undefined {
  return state.locks.find((lock) => lock.grid === grid)
}

// 待办整批写入：任何一条校验不过就整体抛错，外面的网格锁、改派留痕全部不生效。
function commitModuleTodos(draft: DispatchDeskState, todos: ModuleTodo[]): void {
  for (const todo of todos) {
    if (!todo.assignee.trim()) {
      throw new Error(`待办「${todo.title}」缺少责任人`)
    }
    if (!todo.reason.trim()) {
      throw new Error(`待办「${todo.title}」缺少改派依据`)
    }
  }
  for (const todo of todos) {
    const batch = draft.moduleTodos[todo.moduleKey] ?? []
    draft.moduleTodos[todo.moduleKey] = [...batch, todo]
  }
}

function reassignRecord(
  draft: DispatchDeskState,
  input: ReassignInput,
  item: { id: string; title: string; grid: string; hour: number; assignee: string },
  status: ReassignRecord['status'],
): ReassignRecord {
  return {
    id: `RA-${String(draft.reassigns.length + 1).padStart(4, '0')}`,
    itemId: item.id,
    itemTitle: item.title,
    fromGrid: item.grid,
    fromHour: item.hour,
    toGrid: input.toGrid,
    toHour: input.toHour,
    fromAssignee: item.assignee,
    toAssignee: input.toAssignee,
    reason: input.reason,
    operator: input.operator,
    at: now(),
    status,
  }
}

export function submitReassign(input: ReassignInput): ReassignResult {
  const state = loadDeskState()
  const item = state.items.find((entry) => entry.id === input.itemId)
  if (!item) {
    return { ok: false, conflict: false, message: '没有找到要改派的调度事项' }
  }
  if (!DESK_GRIDS.includes(input.toGrid) || !DESK_HOURS.includes(input.toHour)) {
    return { ok: false, conflict: false, message: '目标格不在调度桌范围内' }
  }
  if (item.grid === input.toGrid && item.hour === input.toHour && item.assignee === input.toAssignee) {
    return { ok: false, conflict: false, message: '事项没有变化，不用改派' }
  }
  const lock = lockOfGrid(state, input.toGrid)
  if (lock && lock.owner !== input.operator) {
    // 后到者：改派只挂起为冲突，可以撤回；先锁定者的提交不受影响。
    const draft = cloneDeskState(state)
    draft.reassigns.push(reassignRecord(draft, input, item, '冲突待撤回'))
    saveDeskState(draft)
    return {
      ok: false,
      conflict: true,
      message: `${input.toGrid}已被${lock.owner}锁定，本次改派记为冲突，可在冲突列表中撤回`,
    }
  }
  const draft = cloneDeskState(state)
  const todo: ModuleTodo = {
    id: `TD-${item.moduleKey}-${String((draft.moduleTodos[item.moduleKey] ?? []).length + 1).padStart(4, '0')}`,
    moduleKey: item.moduleKey,
    itemId: item.id,
    title: item.title,
    grid: input.toGrid,
    hour: input.toHour,
    assignee: input.toAssignee,
    reason: input.reason,
    operator: input.operator,
    at: now(),
  }
  try {
    commitModuleTodos(draft, [todo])
  } catch (error) {
    return {
      ok: false,
      conflict: false,
      message: `待办写入失败，本次锁定未生效：${error instanceof Error ? error.message : '未知原因'}`,
    }
  }
  const index = draft.items.findIndex((entry) => entry.id === item.id)
  draft.items[index] = {
    ...draft.items[index],
    grid: input.toGrid,
    hour: input.toHour,
    assignee: input.toAssignee,
  }
  if (!lock) {
    draft.locks.push({ grid: input.toGrid, owner: input.operator, at: now(), round: draft.round })
  }
  draft.reassigns.push(reassignRecord(draft, input, item, '已提交'))
  try {
    saveDeskState(draft)
  } catch {
    return { ok: false, conflict: false, message: '待办写入失败，本次锁定未生效：本地存储不可用' }
  }
  return {
    ok: true,
    conflict: false,
    message: `已改派到${input.toGrid} ${hourLabel(input.toHour)}，待办已写入${item.moduleName}批`,
  }
}

export function withdrawReassign(recordId: string, operator: string): ActionResult {
  const state = loadDeskState()
  const record = state.reassigns.find((entry) => entry.id === recordId)
  if (!record) {
    return { ok: false, message: '没有找到这条改派记录' }
  }
  if (record.status !== '冲突待撤回') {
    return { ok: false, message: '只有冲突中的改派才能撤回' }
  }
  if (record.operator !== operator) {
    return { ok: false, message: '只能撤回自己发起的改派' }
  }
  const draft = cloneDeskState(state)
  const index = draft.reassigns.findIndex((entry) => entry.id === recordId)
  draft.reassigns[index] = { ...draft.reassigns[index], status: '已撤回' }
  saveDeskState(draft)
  return { ok: true, message: '已撤回冲突改派，先锁定者的提交不受影响' }
}

export function createHandover(operator: string): ActionResult {
  const state = loadDeskState()
  const pendingSlip = state.handovers.find((slip) => slip.status === '待接班确认')
  if (pendingSlip) {
    return { ok: false, message: `已有一张待接班确认单（${pendingSlip.id}），等接班人确认后再交班` }
  }
  const draft = cloneDeskState(state)
  // 确认时快照：把当前调度桌整体拍下来存进确认单，调度桌本身不被覆盖。
  const slip: HandoverSlip = {
    id: `HO-${String(draft.handovers.length + 1).padStart(4, '0')}`,
    round: draft.round,
    createdBy: operator,
    createdAt: now(),
    status: '待接班确认',
    confirmedBy: '',
    confirmedAt: '',
    snapshot: {
      items: state.items.map((entry) => ({ ...entry })),
      reassigns: state.reassigns.map((entry) => ({ ...entry })),
    },
  }
  draft.handovers.push(slip)
  saveDeskState(draft)
  return { ok: true, message: `已生成待接班确认单 ${slip.id}，当前调度桌未被覆盖` }
}

export function confirmHandover(slipId: string, operator: string): ActionResult {
  const state = loadDeskState()
  const slip = state.handovers.find((entry) => entry.id === slipId)
  if (!slip) {
    return { ok: false, message: '没有找到这张确认单' }
  }
  if (slip.status !== '待接班确认') {
    return { ok: false, message: '这张确认单已经接班过了' }
  }
  if (slip.createdBy === operator) {
    return { ok: false, message: '交班人不能自己接班，请切换值班人后再确认' }
  }
  const draft = cloneDeskState(state)
  const index = draft.handovers.findIndex((entry) => entry.id === slipId)
  draft.handovers[index] = {
    ...draft.handovers[index],
    status: '已接班',
    confirmedBy: operator,
    confirmedAt: now(),
  }
  // 进入新一轮：网格锁原样保留，新规则只作用于尚未锁定的网格。
  draft.round += 1
  saveDeskState(draft)
  return { ok: true, message: `${slipId} 已接班确认，进入第 ${draft.round} 轮调度` }
}

export function listModuleTodos(moduleKey: string): ModuleTodo[] {
  return loadDeskState().moduleTodos[moduleKey] ?? []
}
