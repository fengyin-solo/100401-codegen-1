<template>
  <div>
    <div v-if="sheet" class="sheet-box">
      <h3>待接班确认单 {{ sheet.id }}</h3>
      <div style="font-size:12px;line-height:1.9">
        交班人：{{ sheet.fromOperator }} · 班次：{{ sheet.fromShift }} · 成单时间：{{ fmt(sheet.createdAt) }}<br />
        交接事项：<strong>{{ sheet.items.length }}</strong> 项（已锁定格子快照），随单改派记录：{{ sheet.reassignIds.length }} 条<br />
        接班确认后将：① 生成不可变历史快照；② 向「缺陷记录」页下发缺陷待办 {{ defectCount }} 条、
        向「泵站运行」页下发泵站待办 {{ pumpCount }} 条（两批互不混）；③ 对应格子冻结。
      </div>
      <table class="data-table" style="margin-top:8px">
        <thead>
          <tr><th>类别</th><th>编号</th><th>事项</th><th>网格/时刻</th><th>责任人</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="snap in sheet.items" :key="snap.itemId">
            <td>{{ cat(snap.category) }}</td>
            <td>{{ snap.refCode }}</td>
            <td>{{ snap.title }}<span v-if="snap.abnormal" class="abnormal-cell"> ●异常</span></td>
            <td>{{ snap.gridName }} {{ formatHour(snap.hour) }}</td>
            <td>{{ snap.owner }}</td>
            <td>{{ snap.sourceStatus }}</td>
          </tr>
        </tbody>
      </table>
      <div class="sheet-actions">
        <button class="btn primary" type="button" @click="$emit('confirm', sheet.id)">接班确认（切换为另一值班人）</button>
        <button class="btn" type="button" @click="$emit('invalidate', sheet.id)">交班人作废</button>
        <span v-if="isFromMe" class="page-desc" style="align-self:center">交班人不能自己确认，请用右上角切换值班人</span>
      </div>
    </div>

    <div v-else class="panel">
      <h3>交班</h3>
      <p class="page-desc">
        交班不会直接覆盖现行排班：系统把当前值班人已锁定提交的格子汇总成一张「待接班确认单」，
        由另一名值班人接班确认后，才生成历史快照并向缺陷记录页、泵站运行页分别下发待办。
      </p>
      <button class="btn primary" type="button" @click="$emit('create')">生成待接班确认单</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { DISPATCH_CATEGORY_LABEL, type DispatchCategory, type HandoverSheet } from '@/data/dispatch-types'
import { formatHour } from '@/api/dispatch-service'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ sheet?: HandoverSheet }>()
defineEmits<{
  (event: 'create'): void
  (event: 'confirm', id: string): void
  (event: 'invalidate', id: string): void
}>()

const session = useSessionStore()
const isFromMe = computed(() => !!props.sheet && props.sheet.fromOperator === session.operator)
const defectCount = computed(() => props.sheet?.items.filter((item) => item.category === 'defect').length ?? 0)
const pumpCount = computed(() => props.sheet?.items.filter((item) => item.category === 'pump_station').length ?? 0)

function cat(category: DispatchCategory): string {
  return DISPATCH_CATEGORY_LABEL[category]
}

function fmt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>
