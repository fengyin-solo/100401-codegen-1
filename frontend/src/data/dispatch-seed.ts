import type { DispatchGrid, DispatchItem, DispatchState } from './dispatch-types'

// 汛前四个责任网格，每个网格五类事项各有默认责任人，改派时默认带出。
export const SEED_GRIDS: DispatchGrid[] = [
  {
    id: 'north',
    name: '城北片网格',
    reach: '环城北路以北 · 北滨河路沿线',
    owners: { pipeline: '管线-郭宁', inspection: '巡检-何拓', defect: '缺陷-常青', pump_station: '泵站-卢苇', emergency: '应急-韩松' },
  },
  {
    id: 'oldtown',
    name: '老城片网格',
    reach: '解放街商圈 · 老城区合流管廊',
    owners: { pipeline: '管线-宋岩', inspection: '巡检-邵敏', defect: '缺陷-常青', pump_station: '泵站-卢苇', emergency: '应急-韩松' },
  },
  {
    id: 'east',
    name: '东站片网格',
    reach: '东站枢纽 · 下穿隧道排水带',
    owners: { pipeline: '管线-郭宁', inspection: '巡检-何拓', defect: '缺陷-罗峥', pump_station: '泵站-费越', emergency: '应急-韩松' },
  },
  {
    id: 'south',
    name: '高新片网格',
    reach: '高新区产业园 · 南河截污干管',
    owners: { pipeline: '管线-宋岩', inspection: '巡检-邵敏', defect: '缺陷-罗峥', pump_station: '泵站-费越', emergency: '应急-韩松' },
  },
]

// 改派候选人池：拖动后可在候选责任人里改选，必须填写改派依据。
export const OWNER_POOL: string[] = [
  '管线-郭宁',
  '管线-宋岩',
  '巡检-何拓',
  '巡检-邵敏',
  '缺陷-常青',
  '缺陷-罗峥',
  '泵站-卢苇',
  '泵站-费越',
  '应急-韩松',
  '应急-雷钧',
]

// 值班长：可切换当前值班人，便于演示两名负责人抢同一格。
export const OPERATORS: string[] = ['顾岑（值班长）', '周澜（值班长）', '沈渡（值班长）']

// 排班小时刻度：白班 08:00-20:00，共 12 个整点格。
export const DISPATCH_HOURS: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]

const SEED_ITEMS: DispatchItem[] = [
  // 城北片
  { id: 'd-001', category: 'pipeline', refCode: 'PIPE-0002', title: '北滨河路干管汛前复核', gridId: 'north', hour: 8, owner: '管线-郭宁', abnormal: false, sourceStatus: '待复核', note: '敷设深度复测，确认过流能力' },
  { id: 'd-002', category: 'inspection', refCode: 'INSP-0001', title: '北片区井盖与雨水口巡查', gridId: 'north', hour: 9, owner: '巡检-何拓', abnormal: false, sourceStatus: '待分配', note: '重点检查低洼路段雨水篦子' },
  { id: 'd-003', category: 'defect', refCode: 'DEFE-0002', title: '北滨河路接口渗漏缺陷确认', gridId: 'north', hour: 10, owner: '缺陷-常青', abnormal: true, sourceStatus: '待确认', note: '降雨前需给出处置结论' },
  { id: 'd-004', category: 'pump_station', refCode: 'PUMP-0001', title: '北关泵站启机前检查', gridId: 'north', hour: 8, owner: '泵站-卢苇', abnormal: false, sourceStatus: '待启机', note: '检查格栅、液位计与备用电源' },
  { id: 'd-005', category: 'emergency', refCode: 'EMER-0001', title: '北片下穿段积水应急值守', gridId: 'north', hour: 14, owner: '应急-韩松', abnormal: false, sourceStatus: '待响应', note: '橙色预警响应，预置抢险班组' },
  // 老城片
  { id: 'd-006', category: 'pipeline', refCode: 'PIPE-0001', title: '解放街合流管建档复核', gridId: 'oldtown', hour: 9, owner: '管线-宋岩', abnormal: false, sourceStatus: '待建档', note: '老管段资料缺失，需补测坐标' },
  { id: 'd-007', category: 'inspection', refCode: 'INSP-0003', title: '商圈沿线巡检（执行中）', gridId: 'oldtown', hour: 10, owner: '巡检-邵敏', abnormal: false, sourceStatus: '执行中', note: '巡检路线：解放街-文化巷' },
  { id: 'd-008', category: 'defect', refCode: 'DEFE-0001', title: '文化巷管段错口缺陷', gridId: 'oldtown', hour: 11, owner: '缺陷-常青', abnormal: true, sourceStatus: '待确认', note: '疑因周边施工扰动，需紧急确认' },
  { id: 'd-009', category: 'pump_station', refCode: 'PUMP-0003', title: '老城泵站运行电流异常', gridId: 'oldtown', hour: 13, owner: '泵站-卢苇', abnormal: true, sourceStatus: '故障中', note: '2 号水泵电流波动，已上报故障' },
  // 东站片
  { id: 'd-010', category: 'inspection', refCode: 'INSP-0002', title: '东站枢纽雨水设施巡查', gridId: 'east', hour: 8, owner: '巡检-何拓', abnormal: false, sourceStatus: '已分配', note: '巡查东西广场雨水口' },
  { id: 'd-011', category: 'emergency', refCode: 'EMER-0002', title: '东站下穿隧道积水处置', gridId: 'east', hour: 15, owner: '应急-韩松', abnormal: true, sourceStatus: '响应中', note: '封路与强排预案待批' },
  { id: 'd-012', category: 'pump_station', refCode: 'PUMP-0002', title: '东站泵站满负荷运行监视', gridId: 'east', hour: 16, owner: '泵站-费越', abnormal: false, sourceStatus: '运行中', note: '每 30 分钟抄报水位电流' },
  // 高新片
  { id: 'd-013', category: 'defect', refCode: 'DEFE-0003', title: '南河截污干管淤积缺陷', gridId: 'south', hour: 10, owner: '缺陷-罗峥', abnormal: false, sourceStatus: '待确认', note: 'CCTV 显示 3 级淤积，待现场确认' },
  { id: 'd-014', category: 'pipeline', refCode: 'PIPE-0003', title: '产业园支管汛前停用确认', gridId: 'south', hour: 14, owner: '管线-宋岩', abnormal: false, sourceStatus: '待复核', note: '配合园区改造临时停用' },
]

export function seedDispatchState(): DispatchState {
  return {
    version: 1,
    grids: SEED_GRIDS,
    items: SEED_ITEMS,
    reassigns: [],
    locks: [],
    handovers: [],
    snapshots: [],
    todos: [],
  }
}
