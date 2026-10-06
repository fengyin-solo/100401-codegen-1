<template>
  <div class="panel">
    <h3>历史调度（确认时快照，不可变更）</h3>
    <p v-if="!snapshots.length" class="page-desc">暂无历史调度。接班确认后会在此保留当次排班的只读快照。</p>
    <div v-for="snap in snapshots" :key="snap.id" class="sheet-box" style="margin-bottom:8px">
      <div style="font-size:12px;line-height:1.9">
        <strong>{{ snap.fromShift }}</strong> · 交班人 {{ snap.fromOperator }} → 接班人 {{ snap.confirmedBy }}
        · 确认时间 {{ fmt(snap.createdAt) }}
      </div>
      <details>
        <summary class="link" style="cursor:pointer;font-size:12px">查看 {{ snap.items.length }} 项快照与 {{ snap.reassigns.length }} 条改派</summary>
        <table class="data-table" style="margin-top:6px">
          <thead>
            <tr><th>类别</th><th>编号</th><th>事项</th><th>网格/时刻</th><th>责任人</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in snap.items" :key="item.itemId">
              <td>{{ cat(item.category) }}</td>
              <td>{{ item.refCode }}</td>
              <td>{{ item.title }}</td>
              <td>{{ item.gridName }} {{ formatHour(item.hour) }}</td>
              <td>{{ item.owner }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="snap.reassigns.length" class="data-table" style="margin-top:6px">
          <thead>
            <tr><th>事项</th><th>前责任人</th><th>后责任人</th><th>依据</th><th>操作人</th></tr>
          </thead>
          <tbody>
            <tr v-for="log in snap.reassigns" :key="log.id">
              <td>{{ log.itemTitle }}</td>
              <td>{{ log.fromOwner }}</td>
              <td>{{ log.toOwner }}</td>
              <td>{{ log.basis }}</td>
              <td>{{ log.operator }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DISPATCH_CATEGORY_LABEL, type DispatchCategory, type DispatchSnapshot } from '@/data/dispatch-types'
import { formatHour } from '@/api/dispatch-service'

defineProps<{ snapshots: DispatchSnapshot[] }>()

function cat(category: DispatchCategory): string {
  return DISPATCH_CATEGORY_LABEL[category]
}

function fmt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>
