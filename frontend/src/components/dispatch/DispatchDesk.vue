<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>汛前调度桌</h2>
        <p class="page-desc">
          先按责任网格铺开管线、巡检、缺陷、泵站、应急五类事项，再按小时刻度组织待办与异常；
          拖动卡片改派必须留前后责任人与依据。格子先锁定先提交，后到者可见冲突并撤回自己的改派。
        </p>
      </div>
    </header>

    <div class="duty-bar">
      <label>
        当前值班人：
        <select :value="session.operator" @change="switchOperator(($event.target as HTMLSelectElement).value)">
          <option v-for="name in operators" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <span>班次：{{ session.shiftLabel }}</span>
      <span class="spacer"></span>
      <label class="switch" title="用于验证：任一待办写入失败，本次锁定/确认整体不生效">
        <input type="checkbox" :checked="failNext" @change="toggleFailNext(($event.target as HTMLInputElement).checked)" />
        模拟下一次写入失败（原子性演示）
      </label>
      <button class="btn" type="button" @click="resetAll">重置调度桌示例</button>
    </div>

    <p class="board-legend">
      <span><i class="legend-box" style="background:#ecfdf3;border:1px solid #abefc6"></i>我锁定的格</span>
      <span><i class="legend-box" style="background:#fef3f2;border:1px solid #fda29b"></i>他人锁定（冲突）</span>
      <span><i class="legend-box" style="background:#f4f6f9;border:1px solid #d8dee6"></i>已交班冻结</span>
      <span><span class="abn" style="color:#d92d20">●异常</span> 表示异常事项优先处置</span>
      <span>提示：两个浏览器标签页可同时打开本页，分别切换不同值班人，模拟两人抢同一格。</span>
    </p>

    <CellBoard
      :cells="cells"
      @drop-item="openReassign"
      @commit-cell="onCommitCell"
      @unlock="onUnlock"
      @withdraw="onWithdraw"
    />

    <div class="duty-panels">
      <HandoverPanel
        :sheet="pending"
        @create="onCreateHandover"
        @confirm="onConfirmHandover"
        @invalidate="onInvalidate"
      />
      <HistoryPanel :snapshots="snapshots" />
    </div>

    <div style="margin-top:14px">
      <AuditPanel :logs="logs" @withdraw="onWithdraw" />
    </div>

    <ReassignDialog
      :payload="dialog"
      @close="dialog = null"
      @submit="submitReassign"
    />

    <div class="toast">
      <div v-for="toast in toasts" :key="toast.id" class="msg" :class="toast.kind">{{ toast.text }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import CellBoard from '@/components/dispatch/CellBoard.vue'
import ReassignDialog, { type ReassignDialogPayload } from '@/components/dispatch/ReassignDialog.vue'
import HandoverPanel from '@/components/dispatch/HandoverPanel.vue'
import HistoryPanel from '@/components/dispatch/HistoryPanel.vue'
import AuditPanel from '@/components/dispatch/AuditPanel.vue'
import { OPERATORS } from '@/data/dispatch-seed'
import type { DispatchItem } from '@/data/dispatch-types'
import { subscribeDispatch, resetDispatch } from '@/data/dispatch-store'
import {
  buildBoard,
  buildReassignViews,
  commitCell,
  confirmHandover,
  createHandover,
  createReassign,
  invalidateHandover,
  isNextWriteFailing,
  listSnapshots,
  nextWriteWillFail,
  pendingHandover,
  unlockCell,
  withdrawReassign,
  type ActionResult,
  type CellView,
} from '@/api/dispatch-service'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const operators = OPERATORS
const failNext = ref(false)

const cells = ref<CellView[]>([])
const logs = ref(buildReassignViews(session.operator))
const pending = ref(pendingHandover())
const snapshots = ref(listSnapshots())
const dialog = ref<ReassignDialogPayload | null>(null)

interface Toast {
  id: number
  kind: 'ok' | 'err'
  text: string
}
const toasts = ref<Toast[]>([])
let toastSeq = 0

function refresh() {
  cells.value = buildBoard(session.operator)
  logs.value = buildReassignViews(session.operator)
  pending.value = pendingHandover()
  snapshots.value = listSnapshots()
  failNext.value = isNextWriteFailing()
}

let unsubscribe: (() => void) | undefined
onMounted(() => {
  refresh()
  unsubscribe = subscribeDispatch(refresh)
})
onUnmounted(() => unsubscribe?.())

function notify(result: ActionResult, successText: string) {
  const id = ++toastSeq
  const text = result.ok ? successText : result.message
  toasts.value.push({ id, kind: result.ok ? 'ok' : 'err', text })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 4000)
  refresh()
}

function switchOperator(name: string) {
  session.setOperator(name)
  refresh()
}

function toggleFailNext(enabled: boolean) {
  nextWriteWillFail(enabled)
  failNext.value = enabled
}

function resetAll() {
  resetDispatch()
  refresh()
}

function openReassign(payload: { item: DispatchItem; gridId: string; hour: number }) {
  dialog.value = {
    item: payload.item,
    from: { gridId: payload.item.gridId, hour: payload.item.hour },
    to: { gridId: payload.gridId, hour: payload.hour },
  }
}

function submitReassign(input: { toOwner: string; basis: string }) {
  if (!dialog.value) {
    return
  }
  const { item, to } = dialog.value
  const result = createReassign({
    itemId: item.id,
    toGridId: to.gridId,
    toHour: to.hour,
    toOwner: input.toOwner,
    basis: input.basis,
  })
  dialog.value = null
  notify(result, '改派已登记为待提交，格子锁定提交后生效；前后责任人与依据已留痕')
}

function onCommitCell(cell: CellView) {
  notify(commitCell(cell.gridId, cell.hour), '已锁定提交：本格改派生效，后到者将看到冲突提示')
}

function onUnlock(cell: CellView) {
  notify(unlockCell(cell.gridId, cell.hour), '格子已解锁，随格生效的改派恢复为待提交')
}

function onWithdraw(reassignId: string) {
  notify(withdrawReassign(reassignId), '改派已撤回，事项恢复到改派前格位')
}

function onCreateHandover() {
  notify(createHandover(), '已生成待接班确认单，请切换另一名值班人接班确认')
}

function onConfirmHandover(id: string) {
  notify(confirmHandover(id), '接班确认完成：历史快照已保留，缺陷/泵站两批待办已分别下发')
}

function onInvalidate(id: string) {
  notify(invalidateHandover(id), '交班确认单已作废，排班恢复可调整')
}
</script>
