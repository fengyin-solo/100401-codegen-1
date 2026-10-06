/** 汛前调度桌的公共类型：调度板、网格锁、改派留痕与交接班确认单都走这套结构。 */

export type DispatchModuleKey = 'pipeline' | 'inspection' | 'defect' | 'pump_station' | 'emergency'

export type DispatchKind = '待办' | '异常'

export type DispatchItem = {
  id: string
  moduleKey: DispatchModuleKey
  moduleName: string
  entryId: number
  title: string
  grid: string
  hour: number
  kind: DispatchKind
  assignee: string
}

export type ReassignStatus = '已提交' | '冲突待撤回' | '已撤回'

export type ReassignRecord = {
  id: string
  itemId: string
  itemTitle: string
  fromGrid: string
  fromHour: number
  toGrid: string
  toHour: number
  fromAssignee: string
  toAssignee: string
  reason: string
  operator: string
  at: string
  status: ReassignStatus
}

export type GridLock = {
  grid: string
  owner: string
  at: string
  round: number
}

export type ModuleTodo = {
  id: string
  moduleKey: string
  itemId: string
  title: string
  grid: string
  hour: number
  assignee: string
  reason: string
  operator: string
  at: string
}

export type HandoverSlip = {
  id: string
  round: number
  createdBy: string
  createdAt: string
  status: '待接班确认' | '已接班'
  confirmedBy: string
  confirmedAt: string
  snapshot: { items: DispatchItem[]; reassigns: ReassignRecord[] }
}

export type DispatchDeskState = {
  round: number
  items: DispatchItem[]
  locks: GridLock[]
  reassigns: ReassignRecord[]
  handovers: HandoverSlip[]
  moduleTodos: Record<string, ModuleTodo[]>
}
