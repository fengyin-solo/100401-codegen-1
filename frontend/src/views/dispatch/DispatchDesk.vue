<template>
  <section class="desk" data-module="dispatch-desk">
    <header class="page-head">
      <div>
        <h2>汛前调度桌</h2>
        <p class="page-desc">
          按责任网格铺开管线、巡检、缺陷、泵站与应急事项，按小时刻度查看待办与异常；拖动事项到目标格即可改派，每次改派都留下前后责任人与依据。
        </p>
      </div>
      <div class="page-actions">
        <label class="desk-operator">
          当前值班
          <select :value="store.operator" @change="switchOperator">
            <option v-for="name in roster" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <span class="legend-item">第 {{ desk.round }} 轮调度</span>
        <button class="btn primary" type="button" @click="handover">交班确认</button>
      </div>
    </header>

    <p class="status-legend">
      <span class="legend-item"><i class="dot dot-todo"></i>待办</span>
      <span class="legend-item"><i class="dot dot-abnormal"></i>异常</span>
      <span v-for="grid in grids" :key="grid" class="legend-item">
        {{ grid }}：{{ gridOwners[grid] }}
        <template v-if="lockOf(grid)">｜🔒{{ lockOf(grid)?.owner }}</template>
      </span>
    </p>

    <div class="desk-scroll">
      <table class="data-table desk-board">
        <thead>
          <tr>
            <th class="desk-grid-col">责任网格</th>
            <th v-for="hour in hours" :key="hour">{{ hourLabel(hour) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grid in grids" :key="grid" :class="{ 'desk-row-locked': lockOf(grid) }">
            <td class="desk-grid-col">
              {{ grid }}
              <span v-if="lockOf(grid)" class="desk-lock">🔒{{ lockOf(grid)?.owner }}</span>
            </td>
            <td
              v-for="hour in hours"
              :key="hour"
              class="desk-cell"
              @dragover.prevent
              @drop="onDrop(grid, hour, $event)"
            >
              <button
                v-for="item in itemsAt(grid, hour)"
                :key="item.id"
                type="button"
                class="desk-chip"
                :class="item.kind === '异常' ? 'chip-abnormal' : 'chip-todo'"
                draggable="true"
                :title="`${item.title}｜${item.kind}｜责任人：${item.assignee}`"
                @dragstart="onDragStart(item, $event)"
              >
                {{ item.title }} · {{ item.assignee }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="draft" class="desk-panel" @submit.prevent="submitDraft">
      <h3>改派确认</h3>
      <p class="desk-draft-line">
        {{ draft.itemTitle }}：{{ draft.fromGrid }} {{ hourLabel(draft.fromHour) }} →
        {{ draft.toGrid }} {{ hourLabel(draft.toHour) }}
      </p>
      <div class="filter-bar">
        <label class="filter-item">
          <span>改派后责任人</span>
          <input v-model="draft.toAssignee" placeholder="填写新的责任人" />
        </label>
        <label class="filter-item">
          <span>改派依据</span>
          <input v-model="draft.reason" placeholder="必填，写入改派记录与模块待办" />
        </label>
        <button class="btn primary" type="submit">提交改派</button>
        <button class="btn ghost" type="button" @click="draft = null">取消</button>
      </div>
    </form>

    <p v-if="message" class="desk-message" :class="{ 'error-text': messageError }">{{ message }}</p>

    <section v-if="conflicts.length" class="desk-panel">
      <h3>冲突改派（同一格只允许先锁定者提交，后到者可撤回自己的改派）</h3>
      <table class="data-table">
        <thead>
          <tr><th>编号</th><th>事项</th><th>目标格</th><th>前责任人</th><th>后责任人</th><th>依据</th><th>操作人</th><th>时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="record in conflicts" :key="record.id">
            <td>{{ record.id }}</td>
            <td>{{ record.itemTitle }}</td>
            <td>{{ record.toGrid }} {{ hourLabel(record.toHour) }}</td>
            <td>{{ record.fromAssignee }}</td>
            <td>{{ record.toAssignee }}</td>
            <td>{{ record.reason || '—' }}</td>
            <td>{{ record.operator }}</td>
            <td>{{ record.at }}</td>
            <td>
              <button
                class="link"
                type="button"
                :disabled="record.operator !== store.operator"
                @click="withdraw(record)"
              >
                撤回
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="desk-panel">
      <h3>改派记录（前后责任人与依据留痕）</h3>
      <table class="data-table">
        <thead>
          <tr><th>编号</th><th>事项</th><th>从</th><th>到</th><th>前责任人</th><th>后责任人</th><th>依据</th><th>操作人</th><th>时间</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="record in reassigns" :key="record.id">
            <td>{{ record.id }}</td>
            <td>{{ record.itemTitle }}</td>
            <td>{{ record.fromGrid }} {{ hourLabel(record.fromHour) }}</td>
            <td>{{ record.toGrid }} {{ hourLabel(record.toHour) }}</td>
            <td>{{ record.fromAssignee }}</td>
            <td>{{ record.toAssignee }}</td>
            <td>{{ record.reason || '—' }}</td>
            <td>{{ record.operator }}</td>
            <td>{{ record.at }}</td>
            <td>{{ record.status }}</td>
          </tr>
          <tr v-if="!reassigns.length">
            <td colspan="10" class="empty-state">暂无改派记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="desk-panel">
      <h3>交接班确认单（交班不覆盖当前调度桌，确认时快照保留历史调度）</h3>
      <table class="data-table">
        <thead>
          <tr><th>单号</th><th>轮次</th><th>交班人</th><th>生成时间</th><th>状态</th><th>接班人</th><th>接班时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="slip in handovers" :key="slip.id">
            <td>{{ slip.id }}</td>
            <td>第 {{ slip.round }} 轮</td>
            <td>{{ slip.createdBy }}</td>
            <td>{{ slip.createdAt }}</td>
            <td>{{ slip.status }}</td>
            <td>{{ slip.confirmedBy || '—' }}</td>
            <td>{{ slip.confirmedAt || '—' }}</td>
            <td class="row-actions">
              <button
                v-if="slip.status === '待接班确认'"
                class="link"
                type="button"
                @click="confirmSlip(slip)"
              >
                接班确认
              </button>
              <details class="desk-snapshot">
                <summary>快照</summary>
                <ul>
                  <li v-for="entry in slip.snapshot.items" :key="entry.id">
                    {{ entry.title }}｜{{ entry.grid }} {{ hourLabel(entry.hour) }}｜{{ entry.assignee }}｜{{ entry.kind }}
                  </li>
                </ul>
              </details>
            </td>
          </tr>
          <tr v-if="!handovers.length">
            <td colspan="8" class="empty-state">暂无交接班确认单</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  confirmHandover,
  createHandover,
  hourLabel,
  loadDesk,
  submitReassign,
  withdrawReassign,
} from '@/api/dispatch-service'
import { DUTY_ROSTER } from '@/data/dispatch-store'
import type {
  DispatchDeskState,
  DispatchItem,
  HandoverSlip,
  ReassignRecord,
} from '@/data/dispatch-types'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const roster = DUTY_ROSTER

const desk = ref<DispatchDeskState>({
  round: 1,
  items: [],
  locks: [],
  reassigns: [],
  handovers: [],
  moduleTodos: {},
})
const grids = ref<string[]>([])
const hours = ref<number[]>([])
const gridOwners = ref<Record<string, string>>({})

const message = ref('')
const messageError = ref(false)

type DraftForm = {
  itemId: string
  itemTitle: string
  fromGrid: string
  fromHour: number
  toGrid: string
  toHour: number
  toAssignee: string
  reason: string
}
const draft = ref<DraftForm | null>(null)

const reassigns = computed(() => [...desk.value.reassigns].reverse())
const conflicts = computed(() => desk.value.reassigns.filter((record) => record.status === '冲突待撤回'))
const handovers = computed(() => [...desk.value.handovers].reverse())

function reload() {
  const view = loadDesk()
  desk.value = view.state
  grids.value = view.grids
  hours.value = view.hours
  gridOwners.value = view.gridOwners
}

function lockOf(grid: string) {
  return desk.value.locks.find((lock) => lock.grid === grid)
}

function itemsAt(grid: string, hour: number) {
  return desk.value.items.filter((item) => item.grid === grid && item.hour === hour)
}

function onDragStart(item: DispatchItem, event: DragEvent) {
  event.dataTransfer?.setData('text/plain', item.id)
}

function onDrop(grid: string, hour: number, event: DragEvent) {
  const itemId = event.dataTransfer?.getData('text/plain')
  if (!itemId) {
    return
  }
  const item = desk.value.items.find((entry) => entry.id === itemId)
  if (!item) {
    return
  }
  draft.value = {
    itemId,
    itemTitle: item.title,
    fromGrid: item.grid,
    fromHour: item.hour,
    toGrid: grid,
    toHour: hour,
    toAssignee: gridOwners.value[grid] ?? item.assignee,
    reason: '',
  }
  message.value = ''
}

function submitDraft() {
  if (!draft.value) {
    return
  }
  if (!draft.value.toAssignee.trim() || !draft.value.reason.trim()) {
    message.value = '改派后责任人与改派依据都要填写，否则待办写入会失败'
    messageError.value = true
    return
  }
  const result = submitReassign({
    itemId: draft.value.itemId,
    toGrid: draft.value.toGrid,
    toHour: draft.value.toHour,
    toAssignee: draft.value.toAssignee.trim(),
    reason: draft.value.reason.trim(),
    operator: store.operator,
  })
  message.value = result.message
  messageError.value = !result.ok
  if (result.ok || result.conflict) {
    draft.value = null
  }
  reload()
}

function withdraw(record: ReassignRecord) {
  const result = withdrawReassign(record.id, store.operator)
  message.value = result.message
  messageError.value = !result.ok
  reload()
}

function handover() {
  const result = createHandover(store.operator)
  message.value = result.message
  messageError.value = !result.ok
  reload()
}

function confirmSlip(slip: HandoverSlip) {
  const result = confirmHandover(slip.id, store.operator)
  message.value = result.message
  messageError.value = !result.ok
  reload()
}

function switchOperator(event: Event) {
  store.setOperator((event.target as HTMLSelectElement).value)
}

onMounted(reload)
</script>
