<template>
  <div class="board-scroll">
    <table class="board">
      <thead>
        <tr>
          <th class="grid-col">责任网格</th>
          <th v-for="hour in hours" :key="hour" class="hour-col">{{ formatHour(hour) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="grid in gridsList" :key="grid.id">
          <th class="grid-col">
            <div>{{ grid.name }}</div>
            <div style="font-weight:400;color:var(--muted);font-size:11px">{{ grid.reach }}</div>
          </th>
          <td
            v-for="cell in rowCells(grid.id)"
            :key="cell.key"
            :class="cellClass(cell)"
            @dragover.prevent="onDragOver($event, cell.key)"
            @dragleave="onDragLeave(cell.key)"
            @drop.prevent="onDrop(cell)"
          >
            <div class="cell-head">
              <span v-if="cell.handedOver" class="lock-tag frozen">已交班冻结</span>
              <span v-else-if="cell.lockedByMe" class="lock-tag me">我已锁定</span>
              <span v-else-if="cell.lock" class="lock-tag other">{{ cell.lock.lockedBy }} 已锁定</span>
              <span v-else></span>
              <span class="cell-ops">
                <button v-if="cell.lockedByMe && !cell.handedOver" type="button" @click="emit('unlock', cell)">解锁</button>
                <button v-if="!cell.lock" type="button" @click="emit('commit-cell', cell)">锁定提交</button>
              </span>
            </div>
            <div class="cell-body">
              <div
                v-for="item in cell.items"
                :key="item.id"
                class="dcard"
                :class="[`cat-${item.category}`, { 'd-card-abnormal': item.abnormal, dragging: draggingId === item.id }]"
                draggable="true"
                @dragstart="onDragStart($event, item)"
                @dragend="onDragEnd"
              >
                <div class="dc-title">
                  <span class="cat-tag" :class="`cat-${item.category}`">{{ catLabel(item.category) }}</span>{{ item.title }}
                  <span v-if="item.abnormal" class="abn">●异常</span>
                </div>
                <div class="dc-meta">{{ item.refCode }} · {{ item.owner }}</div>
                <div v-if="item.note" class="dc-meta">{{ item.note }}</div>
              </div>

              <div
                v-for="ghost in cell.ghostReassigns"
                :key="`g-${ghost.key}`"
                class="ghost"
                :class="ghost.conflict ? 'ghost-conflict' : ghost.mine ? 'ghost-mine' : 'ghost-other'"
              >
                <div>
                  <strong>{{ ghost.mine ? '我的待提交改派' : `${ghost.operator} 的改派` }}</strong>
                  <span v-if="ghost.conflict" class="status-pill pill-conflict">冲突：已被先锁定</span>
                </div>
                <div>{{ ghost.itemTitle }}：{{ ghost.fromOwner }} → {{ ghost.toOwner }}</div>
                <div class="dc-meta">依据：{{ ghost.basis }}</div>
                <div v-if="ghost.mine" class="gh-actions">
                  <button class="link" type="button" @click="emit('withdraw', ghost.id)">撤回改派</button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { DISPATCH_HOURS, SEED_GRIDS } from '@/data/dispatch-seed'
import { DISPATCH_CATEGORY_LABEL, type DispatchGrid, type DispatchItem } from '@/data/dispatch-types'
import { formatHour, type CellView } from '@/api/dispatch-service'

const props = defineProps<{
  cells: CellView[]
  grids?: DispatchGrid[]
}>()

const emit = defineEmits<{
  (event: 'drop-item', payload: { item: DispatchItem; gridId: string; hour: number }): void
  (event: 'commit-cell', cell: CellView): void
  (event: 'unlock', cell: CellView): void
  (event: 'withdraw', reassignId: string): void
}>()

const hours = DISPATCH_HOURS
const gridsList = props.grids ?? SEED_GRIDS
const draggingId = ref<string | null>(null)
const hoverKey = ref<string | null>(null)

function rowCells(gridId: string): CellView[] {
  return props.cells.filter((cell) => cell.gridId === gridId)
}

function cellClass(cell: CellView): Record<string, boolean> {
  return {
    'drop-hover': hoverKey.value === cell.key,
    'cell-frozen': cell.handedOver,
    'cell-locked-me': cell.lockedByMe && !cell.handedOver,
    'cell-locked-other': cell.lockedByOther && !cell.handedOver,
  }
}

function catLabel(category: DispatchItem['category']): string {
  return DISPATCH_CATEGORY_LABEL[category]
}

function onDragStart(event: DragEvent, item: DispatchItem) {
  draggingId.value = item.id
  currentDragId = item.id
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/dispatch-item', item.id)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragEnd() {
  draggingId.value = null
  hoverKey.value = null
}

function onDragOver(event: DragEvent, key: string) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  hoverKey.value = key
}

function onDragLeave(key: string) {
  if (hoverKey.value === key) {
    hoverKey.value = null
  }
}

function onDrop(cell: CellView) {
  hoverKey.value = null
  const itemId = currentDragId
  draggingId.value = null
  if (!itemId) {
    return
  }
  const item = findItem(itemId)
  if (item && !(item.gridId === cell.gridId && item.hour === cell.hour)) {
    emit('drop-item', { item, gridId: cell.gridId, hour: cell.hour })
  }
}

// drop 事件用拖拽起点记录的 id 定位卡片
let currentDragId = ''

function findItem(id: string): DispatchItem | undefined {
  for (const cell of props.cells) {
    const found = cell.items.find((entry) => entry.id === id)
    if (found) {
      return found
    }
  }
  return undefined
}
</script>
