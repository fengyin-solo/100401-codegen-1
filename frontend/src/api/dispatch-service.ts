import { DISPATCH_HOURS, SEED_GRIDS } from '@/data/dispatch-seed'
import {
  cellKey,
  type CellLock,
  type DispatchGrid,
  type DispatchItem,
  type DispatchSnapshot,
  type DispatchState,
  type DispatchTodo,
  type HandoverItemSnapshot,
  type HandoverSheet,
  type InboxCategory,
  type ReassignLog,
} from '@/data/dispatch-types'
import { commitDispatch, dispatchState } from '@/data/dispatch-store'
import { useSessionStore } from '@/stores/session'

export interface ActionResult {
  ok: boolean
  message: string
}

// 测试开关：置位后下一次写库抛错，用来验证「任一待办写入失败，本次锁定不生效」
const FAIL_NEXT_KEY = 'underground-pipeline-inspection:dispatch-fail-next'

export function nextWriteWillFail(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  if (enabled) {
    window.localStorage.setItem(FAIL_NEXT_KEY, '1')
  } else {
    window.localStorage.removeItem(FAIL_NEXT_KEY)
  }
}

export function isNextWriteFailing(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage?.getItem(FAIL_NEXT_KEY)
}

function maybeFailWrite(draft: DispatchState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  if (window.localStorage.getItem(FAIL_NEXT_KEY)) {
    window.localStorage.removeItem(FAIL_NEXT_KEY)
    throw new Error('模拟写入失败：本地存储不可用，本次改动已整体回滚')
  }
  // 顺手做一次容量探测，真实写满时同样在这里抛出，mutate 外层保证整体不生效
  const probe = 'underground-pipeline-inspection:write-probe'
  window.localStorage.setItem(probe, 'x')
  window.localStorage.removeItem(probe)
  void draft
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function grids(): DispatchGrid[] {
  return dispatchState().grids.length ? dispatchState().grids : SEED_GRIDS
}

export function gridById(id: string): DispatchGrid | undefined {
  return grids().find((grid) => grid.id === id)
}

export function defaultOwner(gridId: string, item: DispatchItem): string {
  return gridById(gridId)?.owners[item.category] ?? item.owner
}

// ---- 查询视图 ----

export interface ReassignView extends ReassignLog {
  key: string
  conflict: boolean
  mine: boolean
}

export interface CellView {
  gridId: string
  hour: number
  key: string
  items: DispatchItem[]
  ghostReassigns: ReassignView[]
  lock?: CellLock
  lockedByOther: boolean
  lockedByMe: boolean
  handedOver: boolean
}

function pendingSheet(state: DispatchState): HandoverSheet | undefined {
  return state.handovers.find((sheet) => sheet.status === '待接班确认')
}

/** 待提交改派：以发起人为准决定自己看到的卡片位置；其他人看到原位置 + 虚影。 */
function myPendingReassigns(state: DispatchState, operator: string): ReassignLog[] {
  return state.reassigns.filter((log) => log.status === '待提交' && log.operator === operator)
}

export function displayedItemPosition(
  item: DispatchItem,
  state: DispatchState,
  operator: string,
): { gridId: string; hour: number } {
  const pending = myPendingReassigns(state, operator)
    .filter((log) => log.itemId === item.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return pending ? { gridId: pending.toGridId, hour: pending.toHour } : { gridId: item.gridId, hour: item.hour }
}

export function buildBoard(operator: string): CellView[] {
  const state = dispatchState()
  const lockByKey = new Map(state.locks.map((lock) => [cellKey(lock.gridId, lock.hour), lock]))
  const cells: CellView[] = []
  for (const grid of grids()) {
    for (const hour of DISPATCH_HOURS) {
      const key = cellKey(grid.id, hour)
      const lock = lockByKey.get(key)
      cells.push({
        gridId: grid.id,
        hour,
        key,
        items: [],
        ghostReassigns: [],
        lock,
        lockedByMe: !!lock && lock.lockedBy === operator,
        lockedByOther: !!lock && lock.lockedBy !== operator,
        handedOver: !!lock?.handedOver,
      })
    }
  }
  const cellMap = new Map(cells.map((cell) => [cell.key, cell]))
  for (const item of state.items) {
    const pos = displayedItemPosition(item, state, operator)
    cellMap.get(cellKey(pos.gridId, pos.hour))?.items.push(item)
  }
  // 虚影：落到目标格里的、还没生效也没撤回的改派（自己的虚影用于撤回，别人的虚影用于提示冲突）
  const itemById = new Map(state.items.map((item) => [item.id, item]))
  for (const log of state.reassigns.filter((entry) => entry.status === '待提交')) {
    const targetKey = cellKey(log.toGridId, log.toHour)
    const cell = cellMap.get(targetKey)
    if (!cell) {
      continue
    }
    const targetLock = lockByKey.get(cellKey(log.toGridId, log.toHour))
    const item = itemById.get(log.itemId)
    const itemLost = !!item && (item.gridId !== log.fromGridId || item.hour !== log.fromHour)
    const targetTakenByOther =
      !!targetLock && targetLock.lockedBy !== log.operator && !targetLock.reassignIds.includes(log.id)
    cell.ghostReassigns.push({
      ...log,
      key: log.id,
      mine: log.operator === operator,
      // 冲突：目标格已被他人先锁定，或事项已被别人的锁定改派抢先移动
      conflict: targetTakenByOther || itemLost,
    })
  }
  return cells
}


export function buildReassignViews(operator: string): ReassignView[] {
  const state = dispatchState()
  const lockByKey = new Map(state.locks.map((lock) => [cellKey(lock.gridId, lock.hour), lock]))
  return state.reassigns
    .map((log) => {
      const lock = lockByKey.get(cellKey(log.toGridId, log.toHour))
      // 冲突有两种：目标格已被他人先锁定；或事项已被他人的锁定改派抢先移动
      const item = state.items.find((entry) => entry.id === log.itemId)
      const itemLost =
        !!item && (item.gridId !== log.fromGridId || item.hour !== log.fromHour)
      const targetTakenByOther =
        !!lock && lock.lockedBy !== log.operator && !lock.reassignIds.includes(log.id)
      return {
        ...log,
        key: log.id,
        mine: log.operator === operator,
        // 冲突：目标格已被他人先锁定，或事项已被别人的锁定改派抢先移动
        conflict: log.status === '待提交' && (targetTakenByOther || itemLost),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ---- 改派：拖动事项改派，前/后责任人与依据全部留痕 ----

export interface ReassignInput {
  itemId: string
  toGridId: string
  toHour: number
  toOwner?: string
  basis: string
}

export function createReassign(input: ReassignInput): ActionResult {
  const operator = useSessionStore().operator
  const basis = input.basis.trim()
  if (!basis) {
    return { ok: false, message: '改派必须填写依据（如：雨情变化、责任人在处置更紧急事项）' }
  }
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    if (pendingSheet(draft)) {
      throw new Error('存在待接班确认单，排班已冻结，请等接班确认或作废确认单后再改派')
    }
    const item = draft.items.find((entry) => entry.id === input.itemId)
    if (!item) {
      throw new Error('调度事项不存在或已被移除')
    }
    const targetGrid = draft.grids.find((grid) => grid.id === input.toGridId)
    if (!targetGrid) {
      throw new Error('目标责任网格不存在')
    }
    if (!DISPATCH_HOURS.includes(input.toHour)) {
      throw new Error('改派时刻必须落在当班小时刻度内')
    }
    const targetLock = draft.locks.find(
      (lock) => lock.gridId === input.toGridId && lock.hour === input.toHour,
    )
    if (targetLock) {
      const label = targetLock.handedOver
        ? '该格已随交班锁定，新规则只作用于尚未锁定的网格'
        : `该格已被 ${targetLock.lockedBy} 先锁定提交，您可以查看冲突并撤回自己的改派`
      throw new Error(label)
    }
    // 已锁定的格子（无论是否交班）都不能再把事项拖走：未交班的锁需先解锁，已交班的锁不可解
    const sourceLock = draft.locks.find(
      (lock) => lock.gridId === item.gridId && lock.hour === item.hour,
    )
    if (sourceLock) {
      if (sourceLock.handedOver) {
        throw new Error('事项所在格已随交班锁定，不能再改派；新规则只作用于尚未锁定的网格')
      }
      if (sourceLock.lockedBy !== operator) {
        throw new Error(`事项所在格已被 ${sourceLock.lockedBy} 锁定，需其先解锁后才能改派`)
      }
      throw new Error('事项所在格已被您锁定，请先解锁该格再改派')
    }
    // 当前位置取自己最近一条待提交改派，没有则取事项原位；同一格重复拖入直接忽略
    const myLatest = draft.reassigns
      .filter((log) => log.status === '待提交' && log.operator === operator && log.itemId === item.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const fromGridId = myLatest?.fromGridId ?? item.gridId
    const fromHour = myLatest?.fromHour ?? item.hour
    const fromOwner = myLatest?.fromOwner ?? item.owner
    if (fromGridId === input.toGridId && fromHour === input.toHour) {
      throw new Error('事项已经在该格，无需改派')
    }
    // 同一事项再次拖动改派：旧待提交改派作废（撤回），只保留最新一条的链路
    for (const old of draft.reassigns.filter(
      (log) => log.status === '待提交' && log.itemId === item.id && log.operator === operator,
    )) {
      old.status = '已撤回'
      old.withdrawnBy = operator
      old.withdrawnAt = new Date().toISOString()
    }
    const toOwner = (input.toOwner ?? '').trim() || targetGrid.owners[item.category]
    draft.reassigns.push({
      id: makeId('chg'),
      itemId: item.id,
      itemTitle: item.title,
      fromGridId,
      fromHour,
      toGridId: input.toGridId,
      toHour: input.toHour,
      fromOwner,
      toOwner,
      basis,
      operator,
      createdAt: new Date().toISOString(),
      status: '待提交',
    })
  })
}

/** 撤回自己发起、尚未生效的改派，事项回到原格；同样留痕。 */
export function withdrawReassign(reassignId: string): ActionResult {
  const operator = useSessionStore().operator
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    const log = draft.reassigns.find((entry) => entry.id === reassignId)
    if (!log) {
      throw new Error('改派记录不存在')
    }
    if (log.status !== '待提交') {
      throw new Error('该改派已生效或已撤回，不能再撤回')
    }
    if (log.operator !== operator) {
      throw new Error('只能撤回自己发起的改派')
    }
    log.status = '已撤回'
    log.withdrawnBy = operator
    log.withdrawnAt = new Date().toISOString()
  })
}

// ---- 格子锁定：只允许先锁定者提交，原子写入 ----

export function commitCell(gridId: string, hour: number): ActionResult {
  const operator = useSessionStore().operator
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    if (pendingSheet(draft)) {
      throw new Error('存在待接班确认单，请等接班确认后再锁定格子')
    }
    const existing = draft.locks.find((lock) => lock.gridId === gridId && lock.hour === hour)
    if (existing) {
      throw new Error(
        existing.lockedBy === operator ? '该格已由您锁定，无需重复提交' : `该格已被 ${existing.lockedBy} 先锁定，您无法提交`,
      )
    }
    // 收集落在本格的、由本人发起的待提交改派；同一事项只取本人最新一条
    const mine = draft.reassigns
      .filter(
        (log) =>
          log.status === '待提交' &&
          log.operator === operator &&
          log.toGridId === gridId &&
          log.toHour === hour,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((log, index, array) => array.findIndex((entry) => entry.itemId === log.itemId) === index)
    // 核对：事项仍在、且仍处在「我发起改派时的原格」（别人可能已先锁定）；任一不过整批不生效
    for (const log of mine) {
      const item = draft.items.find((entry) => entry.id === log.itemId)
      if (!item) {
        throw new Error(`改派事项「${log.itemTitle}」已不存在，锁定不生效`)
      }
      if (!draft.grids.some((grid) => grid.id === log.toGridId)) {
        throw new Error(`改派目标网格已失效，锁定不生效`)
      }
      if (item.gridId !== log.fromGridId || item.hour !== log.fromHour) {
        throw new Error(`事项「${log.itemTitle}」已被其他值班人先锁定改派，您的改派存在冲突，请撤回后重试`)
      }
      const sourceLock = draft.locks.find(
        (lock) => lock.gridId === log.fromGridId && lock.hour === log.fromHour,
      )
      if (sourceLock) {
        throw new Error(`事项「${log.itemTitle}」原格已被锁定，请撤回您的改派`)
      }
    }
    // 先锁格再写移动：锁一旦写入即占位，其它值班人再提交同一格会冲突
    const lock: CellLock = {
      gridId,
      hour,
      lockedBy: operator,
      lockedAt: new Date().toISOString(),
      reassignIds: mine.map((log) => log.id),
      handedOver: false,
    }
    draft.locks.push(lock)
    for (const log of mine) {
      const item = draft.items.find((entry) => entry.id === log.itemId)
      if (!item) {
        continue
      }
      item.gridId = log.toGridId
      item.hour = log.toHour
      item.owner = log.toOwner
      log.status = '已生效'
      log.lockKey = cellKey(gridId, hour)
    }
  })
}

export function unlockCell(gridId: string, hour: number): ActionResult {
  const operator = useSessionStore().operator
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    if (pendingSheet(draft)) {
      throw new Error('存在待接班确认单，不能解锁格子')
    }
    const index = draft.locks.findIndex((lock) => lock.gridId === gridId && lock.hour === hour)
    if (index < 0) {
      throw new Error('该格未锁定')
    }
    const lock = draft.locks[index]
    if (lock.handedOver) {
      throw new Error('该格已随交班确认，不能解锁')
    }
    if (lock.lockedBy !== operator) {
      throw new Error(`只能解锁自己锁定的格子（锁定人：${lock.lockedBy}）`)
    }
    // 解锁：随锁生效的改派回退为待提交，事项恢复改派前位置
    for (const log of draft.reassigns.filter((entry) => entry.lockKey === lockKeyOf(gridId, hour))) {
      const item = draft.items.find((entry) => entry.id === log.itemId)
      if (item) {
        item.gridId = log.fromGridId
        item.hour = log.fromHour
        item.owner = log.fromOwner
      }
      log.status = '待提交'
      log.lockKey = undefined
    }
    draft.locks.splice(index, 1)
  })
}

function lockKeyOf(gridId: string, hour: number): string {
  return cellKey(gridId, hour)
}

// ---- 交班：不直接覆盖，生成待接班确认单 ----

function snapshotItemOf(state: DispatchState, item: DispatchItem): HandoverItemSnapshot {
  const grid = state.grids.find((entry) => entry.id === item.gridId)
  return {
    itemId: item.id,
    category: item.category,
    refCode: item.refCode,
    title: item.title,
    gridId: item.gridId,
    gridName: grid?.name ?? item.gridId,
    hour: item.hour,
    owner: item.owner,
    abnormal: item.abnormal,
    sourceStatus: item.sourceStatus,
    note: item.note,
  }
}

export function createHandover(): ActionResult {
  const session = useSessionStore()
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    if (pendingSheet(draft)) {
      throw new Error('已存在待接班确认单，不能重复交班')
    }
    const locked = draft.locks.filter((lock) => !lock.handedOver)
    if (locked.length === 0) {
      throw new Error('还没有锁定提交任何格子，无可交班内容')
    }
    // 只交接已锁定格里的事项（确认时的排班快照）
    const lockedKeys = new Set(locked.map((lock) => cellKey(lock.gridId, lock.hour)))
    const items = draft.items
      .filter((item) => lockedKeys.has(cellKey(item.gridId, item.hour)))
      .map((item) => snapshotItemOf(draft, item))
    if (items.length === 0) {
      throw new Error('锁定的格子里没有调度事项，无可交班内容')
    }
    const reassignIds = locked.flatMap((lock) => lock.reassignIds)
    draft.handovers.push({
      id: makeId('shift'),
      fromOperator: session.operator,
      fromShift: session.shiftLabel,
      createdAt: new Date().toISOString(),
      status: '待接班确认',
      items,
      reassignIds,
    })
  })
}

export function pendingHandover(): HandoverSheet | undefined {
  return pendingSheet(dispatchState())
}

/** 接班确认：须交班人之外的值班人确认；快照保留 + 两批待办原子下发。 */
export function confirmHandover(handoverId: string): ActionResult {
  const operator = useSessionStore().operator
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    const sheet = draft.handovers.find((entry) => entry.id === handoverId)
    if (!sheet) {
      throw new Error('交班确认单不存在')
    }
    if (sheet.status !== '待接班确认') {
      throw new Error(`确认单已是「${sheet.status}」，不能重复确认`)
    }
    if (sheet.fromOperator === operator) {
      throw new Error('交班人不能自己接班，请切换为另一名值班人后确认')
    }
    // 确认前再校验一次：事项仍在、快照格子仍处于锁定状态，任一异常整单不生效
    const lockedKeys = new Set(draft.locks.map((lock) => cellKey(lock.gridId, lock.hour)))
    for (const snap of sheet.items) {
      const item = draft.items.find((entry) => entry.id === snap.itemId)
      if (!item) {
        throw new Error(`事项「${snap.title}」已不存在，接班确认不生效`)
      }
      if (!lockedKeys.has(cellKey(snap.gridId, snap.hour))) {
        throw new Error(`事项「${snap.title}」所在格子已解锁，接班确认不生效`)
      }
      // 还有指向单内事项的待提交改派时不能冻结，否则撤回会把事项拉出已冻结格
      const dangling = draft.reassigns.find(
        (log) => log.status === '待提交' && log.itemId === snap.itemId,
      )
      if (dangling) {
        throw new Error(
          `事项「${snap.title}」还存在 ${dangling.operator} 的待提交改派，请先撤回或提交后再接班确认`,
        )
      }
    }

    const now = new Date().toISOString()
    const snapshotId = makeId('snap')
    const snapshot: DispatchSnapshot = {
      id: snapshotId,
      handoverId: sheet.id,
      fromOperator: sheet.fromOperator,
      fromShift: sheet.fromShift,
      confirmedBy: operator,
      createdAt: now,
      items: sheet.items.map((entry) => ({ ...entry })),
      reassigns: draft.reassigns
        .filter((log) => sheet.reassignIds.includes(log.id))
        .map((log) => ({ ...log })),
    }
    draft.snapshots.unshift(snapshot)

    // 两批不同的待办：缺陷 → 缺陷记录页；泵站 → 泵站运行页
    const deliver: DispatchTodo[] = sheet.items
      .filter((snap) => snap.category === 'defect' || snap.category === 'pump_station')
      .map((snap) => {
        const related = draft.reassigns.find((log) => log.itemId === snap.itemId && sheet.reassignIds.includes(log.id))
        return {
          id: makeId('todo'),
          handoverId: sheet.id,
          snapshotId,
          itemId: snap.itemId,
          category: snap.category as InboxCategory,
          refCode: snap.refCode,
          title: snap.title,
          gridId: snap.gridId,
          gridName: snap.gridName,
          hour: snap.hour,
          owner: snap.owner,
          abnormal: snap.abnormal,
          basis: related ? related.basis : '汛前调度桌排班（无改派）',
          deliveredAt: now,
          status: '待办' as const,
        }
      })
    draft.todos.push(...deliver)

    // 全部待办写入成功后，才推进确认单与格子状态（前面任一异常都不会走到这里）
    sheet.status = '已确认'
    sheet.confirmedBy = operator
    sheet.confirmedAt = now
    sheet.snapshotId = snapshotId
    for (const lock of draft.locks) {
      if (!lockedKeys.has(cellKey(lock.gridId, lock.hour))) {
        continue
      }
      const inSheet = sheet.items.some((snap) => snap.gridId === lock.gridId && snap.hour === lock.hour)
      if (inSheet) {
        lock.handedOver = true
        lock.handoverId = sheet.id
      }
    }
    for (const log of draft.reassigns) {
      if (sheet.reassignIds.includes(log.id)) {
        log.handoverId = sheet.id
      }
    }
  })
}

export function invalidateHandover(handoverId: string): ActionResult {
  const operator = useSessionStore().operator
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    const sheet = draft.handovers.find((entry) => entry.id === handoverId)
    if (!sheet) {
      throw new Error('交班确认单不存在')
    }
    if (sheet.status !== '待接班确认') {
      throw new Error('只有待接班确认单可以作废')
    }
    if (sheet.fromOperator !== operator) {
      throw new Error('只能由交班发起人作废自己的确认单')
    }
    sheet.status = '已作废'
  })
}

export function listSnapshots(): DispatchSnapshot[] {
  return dispatchState().snapshots
}

// ---- 缺陷记录页 / 泵站运行页收到的两批待办 ----

export function listTodos(category: InboxCategory): DispatchTodo[] {
  return dispatchState()
    .todos.filter((todo) => todo.category === category)
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))
}

export function completeTodo(todoId: string): ActionResult {
  return commitDispatch((draft) => {
    maybeFailWrite(draft)
    const todo = draft.todos.find((entry) => entry.id === todoId)
    if (!todo) {
      throw new Error('待办不存在')
    }
    if (todo.status === '已处理') {
      throw new Error('该待办已处理')
    }
    todo.status = '已处理'
    todo.handledAt = new Date().toISOString()
  })
}

export function todoCounts(): { defect: number; pump_station: number } {
  const state = dispatchState()
  return {
    defect: state.todos.filter((todo) => todo.category === 'defect' && todo.status === '待办').length,
    pump_station: state.todos.filter((todo) => todo.category === 'pump_station' && todo.status === '待办').length,
  }
}
