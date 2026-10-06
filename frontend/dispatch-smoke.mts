// 业务规则冒烟测试：在 Node 里 mock localStorage/pinia，直接跑调度服务
import { createPinia, setActivePinia } from 'pinia'

const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  addEventListener: () => {},
}

const svc = await import('./src/api/dispatch-service.ts')
const { resetDispatch } = await import('./src/data/dispatch-store.ts')
const { useSessionStore } = await import('./src/stores/session.ts')

setActivePinia(createPinia())
const session = useSessionStore()

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name} ${detail}`)
  }
}

function boardCell(cells, gridId, hour) {
  return cells.find((c) => c.gridId === gridId && c.hour === hour)
}

// ---- 场景：顾岑改派、锁定；周澜抢格冲突、撤回；交班+接班原子下发 ----
resetDispatch()
session.setOperator('顾岑（值班长）')

// 1. 无依据改派必须拒绝
let r = svc.createReassign({ itemId: 'd-003', toGridId: 'oldtown', toHour: 11, basis: '   ' })
check('无依据改派被拒', !r.ok)

// 2. 顾岑把 d-003（北片10点 缺陷-常青）拖到 老城11点
r = svc.createReassign({ itemId: 'd-003', toGridId: 'oldtown', toHour: 11, basis: '老城错口缺陷更紧急，北片人员暂缓' })
check('有依据改派登记成功', r.ok, r.message)

// 卡片在顾岑视角已移动到目标格（待提交）
let cells = svc.buildBoard(session.operator)
check('我的待提交改派：卡片显示在目标格', boardCell(cells, 'oldtown', 11).items.some((i) => i.id === 'd-003'))
check('目标格有我的虚影改派', boardCell(cells, 'oldtown', 11).ghostReassigns.some((g) => g.mine))

// 周澜视角：卡片仍在原位，目标格看到别人的虚影（非冲突，因为格还没锁）
session.setOperator('周澜（值班长）')
cells = svc.buildBoard(session.operator)
check('他人视角卡片仍在原格', boardCell(cells, 'north', 10).items.some((i) => i.id === 'd-003'))
check('他人视角看到顾岑虚影', boardCell(cells, 'oldtown', 11).ghostReassigns.some((g) => !g.mine))

// 3. 周澜也往同一格拖一张卡（d-008 本来就在老城11 → 换 d-013 拖入）
r = svc.createReassign({ itemId: 'd-013', toGridId: 'oldtown', toHour: 11, basis: '南河淤积需老城班组顺道复核' })
check('周澜同格改派登记成功（锁前允许）', r.ok, r.message)

// 4. 顾岑先锁定提交 oldtown@11
session.setOperator('顾岑（值班长）')
r = svc.commitCell('oldtown', 11)
check('先锁定者提交成功', r.ok, r.message)
// 顾岑自己的改派应已生效，d-003 移动
cells = svc.buildBoard(session.operator)
check('锁定后顾岑改派生效：d-003 在老城11', boardCell(cells, 'oldtown', 11).items.some((i) => i.id === 'd-003'))
const log = svc.buildReassignViews(session.operator).find((l) => l.itemId === 'd-003')
check('顾岑改派状态已生效', log.status === '已生效', log.status)

// 5. 周澜再提交同一格 → 冲突
session.setOperator('周澜（值班长）')
r = svc.commitCell('oldtown', 11)
check('后到者锁定提交被拒', !r.ok && r.message.includes('先锁定'))

// 周澜看到冲突，能撤回自己的改派
const views = svc.buildReassignViews(session.operator)
const zhou = views.find((l) => l.itemId === 'd-013')
check('周澜改派标记为冲突', zhou.conflict === true)
r = svc.withdrawReassign(zhou.id)
check('后到者可撤回自己的改派', r.ok, r.message)
const after = svc.buildReassignViews(session.operator).find((l) => l.id === zhou.id)
check('撤回后状态为已撤回且有撤回人', after.status === '已撤回' && after.withdrawnBy === '周澜（值班长）')

// 周澜不能撤回顾岑已生效的改派
const guLog = svc.buildReassignViews('顾岑（值班长）').find((l) => l.itemId === 'd-003')
r = svc.withdrawReassign(guLog.id)
check('不能撤回他人/已生效改派', !r.ok)

// 6. 顾岑不能再往已锁定格拖入
session.setOperator('顾岑（值班长）')
r = svc.createReassign({ itemId: 'd-001', toGridId: 'oldtown', toHour: 11, basis: '尝试插队' })
check('已锁定格拒绝新改派', !r.ok && r.message.includes('先锁定'))

// 7. 原子性：模拟下一次写入失败 → 锁定不生效
svc.nextWriteWillFail(true)
r = svc.commitCell('north', 9)
check('写入失败时锁定整体不生效', !r.ok && r.message.includes('回滚'))
cells = svc.buildBoard(session.operator)
check('失败后北片9点仍未锁定', !boardCell(cells, 'north', 9).lock)

// 8. 交班：不能自己接班
r = svc.createHandover()
check('生成待接班确认单', r.ok, r.message)
r = svc.confirmHandover(svc.pendingHandover().id)
check('交班人不能自己接班确认', !r.ok && r.message.includes('另一名值班人'))

// 9. 切换周澜接班确认 → 快照 + 两批待办
session.setOperator('周澜（值班长）')
const sheetId = svc.pendingHandover().id
const beforeTodos = { defect: svc.listTodos('defect').length, pump: svc.listTodos('pump_station').length }
r = svc.confirmHandover(sheetId)
check('接班人确认成功', r.ok, r.message)
check('生成历史快照 1 份', svc.listSnapshots().length === 1)
const defectTodos = svc.listTodos('defect')
const pumpTodos = svc.listTodos('pump_station')
check('缺陷页收到缺陷批待办', defectTodos.length >= beforeTodos.defect + 1 && defectTodos.every((t) => t.category === 'defect'))
check('泵站页收到泵站批待办', pumpTodos.every((t) => t.category === 'pump_station'))
check('两批待办互不混杂', !defectTodos.some((t) => t.category === 'pump_station') && !pumpTodos.some((t) => t.category === 'defect'))
check('待办关联同一快照与确认单', defectTodos.every((t) => t.handoverId === sheetId))

// 10. 快照不可变：已交班冻结格不能再改派
r = svc.createReassign({ itemId: 'd-003', toGridId: 'north', toHour: 10, basis: '想反悔' })
check('冻结格改派被拒（新规则不作用于已锁定网格）', !r.ok && r.message.includes('已随交班锁定'))

// 11. 快照内容不受后续操作影响：解锁也不能解冻结格
r = svc.unlockCell('oldtown', 11)
check('已交班格子不能解锁', !r.ok)
const snap = svc.listSnapshots()[0]
check('快照保留确认时的责任人与依据', snap.items.some((i) => i.itemId === 'd-003' && i.owner === '缺陷-常青') && snap.reassigns.some((l) => l.itemId === 'd-003' && l.basis.includes('老城错口')))

// 12. 待办可在业务页处理
const todoId = defectTodos[0].id
r = svc.completeTodo(todoId)
check('业务页可处理下发待办', r.ok && svc.listTodos('defect').find((t) => t.id === todoId).status === '已处理')

// 13. 待接班期间冻结改派：作废流程
resetDispatch()
session.setOperator('顾岑（值班长）')
svc.commitCell('oldtown', 11)
svc.createHandover()
r = svc.createReassign({ itemId: 'd-001', toGridId: 'south', toHour: 9, basis: '待确认期间尝试改派' })
check('待接班确认期间禁止改派', !r.ok && r.message.includes('冻结'))
svc.invalidateHandover(svc.pendingHandover().id)
svc.unlockCell('oldtown', 11)

// 14. 单内事项存在他人「抢格落败」的待提交改派时，接班确认被阻止
resetDispatch()
// 周澜先登记改派（尚未锁定）
session.setOperator('周澜（值班长）')
r = svc.createReassign({ itemId: 'd-003', toGridId: 'north', toHour: 12, basis: '周澜先登记改派同一缺陷' })
check('周澜先登记改派成功', r.ok, r.message)
// 顾岑随后就同一事项登记自己的改派并先锁定目标格
session.setOperator('顾岑（值班长）')
r = svc.createReassign({ itemId: 'd-003', toGridId: 'oldtown', toHour: 11, basis: '缺陷提级处置' })
check('顾岑随后登记自己的改派', r.ok, r.message)
r = svc.commitCell('oldtown', 11)
check('顾岑先锁定提交成功，周澜的改派落败成为悬留改派', r.ok, r.message)
svc.createHandover()
session.setOperator('周澜（值班长）')
r = svc.confirmHandover(svc.pendingHandover().id)
check('存在悬留待提交改派时接班确认被阻止', !r.ok && r.message.includes('待提交改派'), r.message)
const pendingLog = svc.buildReassignViews(session.operator).find((l) => l.itemId === 'd-003' && l.status === '待提交')
check('落败方能在留痕里定位到自己的冲突改派', !!pendingLog && pendingLog.conflict === true)
r = svc.withdrawReassign(pendingLog.id)
check('后到者撤回自己的改派', r.ok, r.message)
r = svc.confirmHandover(svc.pendingHandover().id)
check('撤回后接班确认成功', r.ok, r.message)

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
