<template>
  <div v-if="payload" class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <h3>拖动改派 · 留痕确认</h3>
      <p class="from-line">
        事项：<strong>{{ payload.item.title }}</strong>（{{ payload.item.refCode }}）<br />
        原格：{{ gridName(payload.from.gridId) }} {{ formatHour(payload.from.hour) }}
        → 新格：{{ gridName(payload.to.gridId) }} {{ formatHour(payload.to.hour) }}
      </p>
      <label>前责任人（改派前）</label>
      <input :value="fromOwner" disabled />
      <label>后责任人（改派后，可在候选责任人中改选）</label>
      <select v-model="toOwner">
        <option v-for="owner in ownerPool" :key="owner" :value="owner">{{ owner }}</option>
      </select>
      <label>改派依据（必填，随改派记录长期留存）</label>
      <textarea v-model="basis" rows="3" placeholder="例如：气象升级为暴雨橙色预警，老城缺陷需提至早班；原责任人在处置更紧急积水点"></textarea>
      <p class="page-desc">改派在格子「锁定提交」前为待提交状态，可撤回；锁定后才正式生效并随交班进入确认单。</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" @click="confirm">确认改派</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { OWNER_POOL } from '@/data/dispatch-seed'
import type { DispatchItem } from '@/data/dispatch-types'
import { defaultOwner, formatHour, gridById } from '@/api/dispatch-service'

export interface ReassignDialogPayload {
  item: DispatchItem
  from: { gridId: string; hour: number }
  to: { gridId: string; hour: number }
}

const props = defineProps<{ payload: ReassignDialogPayload | null }>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', input: { toOwner: string; basis: string }): void
}>()

const ownerPool = OWNER_POOL
const toOwner = ref('')
const basis = ref('')

watch(
  () => props.payload,
  (payload) => {
    basis.value = ''
    toOwner.value = payload ? defaultOwner(payload.to.gridId, payload.item) : ''
  },
)

const fromOwner = ref('')
watch(
  () => props.payload,
  (payload) => {
    fromOwner.value = payload ? payload.item.owner : ''
  },
  { immediate: true },
)

function gridName(id: string): string {
  return gridById(id)?.name ?? id
}

function confirm() {
  emit('submit', { toOwner: toOwner.value, basis: basis.value })
}
</script>
