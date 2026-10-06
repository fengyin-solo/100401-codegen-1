/** 汛前调度桌数据域类型：独立于业务模块台账，单独持久化。 */

// 调度桌上的五类事项：管线、巡检、缺陷、泵站、应急
export type DispatchCategory = 'pipeline' | 'inspection' | 'defect' | 'pump_station' | 'emergency'

// 只有缺陷、泵站两类在接班确认后下发到对应业务页面
export type InboxCategory = Extract<DispatchCategory, 'defect' | 'pump_station'>

export const DISPATCH_CATEGORY_LABEL: Record<DispatchCategory, string> = {
  pipeline: '管线',
  inspection: '巡检',
  defect: '缺陷',
  pump_station: '泵站',
  emergency: '应急',
}

/** 责任网格：每行一个网格，owners 是五类事项在该网格的默认责任人。 */
export interface DispatchGrid {
  id: string
  name: string
  reach: string
  owners: Record<DispatchCategory, string>
}

/** 调度事项（排班卡片）。位置由 gridId + hour（整点，24 小时制）确定。 */
export interface DispatchItem {
  id: string
  category: DispatchCategory
  refCode: string
  title: string
  gridId: string
  hour: number
  owner: string
  abnormal: boolean
  sourceStatus: string
  note: string
}

export type ReassignStatus = '待提交' | '已撤回' | '已生效'

/**
 * 改派记录：每次拖动改派都留痕，前责任人、后责任人、依据缺一不可。
 * 「待提交」是值班人发起但尚未随格子锁定生效的改派，可以撤回。
 */
export interface ReassignLog {
  id: string
  itemId: string
  itemTitle: string
  fromGridId: string
  fromHour: number
  toGridId: string
  toHour: number
  fromOwner: string
  toOwner: string
  basis: string
  operator: string
  createdAt: string
  status: ReassignStatus
  lockKey?: string
  handoverId?: string
  withdrawnBy?: string
  withdrawnAt?: string
}

/** 格子锁：同一（网格, 小时）只允许先锁定者提交。 */
export interface CellLock {
  gridId: string
  hour: number
  lockedBy: string
  lockedAt: string
  reassignIds: string[]
  handedOver: boolean
  handoverId?: string
}

/** 进入交班确认单 / 快照的事项副本，确认后不再随现行排班变化。 */
export interface HandoverItemSnapshot {
  itemId: string
  category: DispatchCategory
  refCode: string
  title: string
  gridId: string
  gridName: string
  hour: number
  owner: string
  abnormal: boolean
  sourceStatus: string
  note: string
}

export type HandoverStatus = '待接班确认' | '已确认' | '已作废'

/** 交班确认单：交班不直接覆盖，先成单，由另一名值班人接班确认。 */
export interface HandoverSheet {
  id: string
  fromOperator: string
  fromShift: string
  createdAt: string
  status: HandoverStatus
  confirmedBy?: string
  confirmedAt?: string
  snapshotId?: string
  items: HandoverItemSnapshot[]
  reassignIds: string[]
}

/** 历史调度：接班确认那一刻的不可变快照。 */
export interface DispatchSnapshot {
  id: string
  handoverId: string
  fromOperator: string
  fromShift: string
  confirmedBy: string
  createdAt: string
  items: HandoverItemSnapshot[]
  reassigns: ReassignLog[]
}

/** 接班确认后下发到缺陷记录页 / 泵站运行页的待办，两页各收各的批次。 */
export interface DispatchTodo {
  id: string
  handoverId: string
  snapshotId: string
  itemId: string
  category: InboxCategory
  refCode: string
  title: string
  gridId: string
  gridName: string
  hour: number
  owner: string
  abnormal: boolean
  basis: string
  deliveredAt: string
  status: '待办' | '已处理'
  handledAt?: string
}

export interface DispatchState {
  version: number
  grids: DispatchGrid[]
  items: DispatchItem[]
  reassigns: ReassignLog[]
  locks: CellLock[]
  handovers: HandoverSheet[]
  snapshots: DispatchSnapshot[]
  todos: DispatchTodo[]
}

export function cellKey(gridId: string, hour: number): string {
  return `${gridId}@${hour}`
}
