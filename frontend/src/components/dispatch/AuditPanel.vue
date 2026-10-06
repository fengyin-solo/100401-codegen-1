<template>
  <div class="panel">
    <h3>改派留痕（前后责任人与依据）</h3>
    <p v-if="!logs.length" class="page-desc">还没有改派记录。把事项卡片拖到另一个网格/小时格即可发起改派。</p>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>事项</th><th>前 → 后</th><th>格位变化</th><th>依据</th><th>操作人/时间</th><th>状态</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs" :key="log.key">
          <td>{{ log.itemTitle }}</td>
          <td>{{ log.fromOwner }} → <strong>{{ log.toOwner }}</strong></td>
          <td style="white-space:nowrap">
            {{ gridName(log.fromGridId) }} {{ formatHour(log.fromHour) }}<br />
            → {{ gridName(log.toGridId) }} {{ formatHour(log.toHour) }}
          </td>
          <td>{{ log.basis }}</td>
          <td style="white-space:nowrap">{{ log.operator }}<br /><span class="page-desc">{{ fmt(log.createdAt) }}</span></td>
          <td>
            <span
              class="status-pill"
              :class="log.status === '待提交' ? (log.conflict ? 'pill-conflict' : 'pill-pending') : log.status === '已生效' ? 'pill-ok' : 'pill-void'"
            >
              {{ log.status }}{{ log.status === '待提交' && log.conflict ? '·冲突' : '' }}
            </span>
            <div v-if="log.status === '已撤回' && log.withdrawnBy" class="page-desc">{{ log.withdrawnBy }} 撤回</div>
          </td>
          <td>
            <button v-if="log.status === '待提交' && log.mine" class="link" type="button" @click="$emit('withdraw', log.id)">
              撤回
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { formatHour, gridById, type ReassignView } from '@/api/dispatch-service'

defineProps<{ logs: ReassignView[] }>()
defineEmits<{ (event: 'withdraw', id: string): void }>()

function gridName(id: string): string {
  return gridById(id)?.name ?? id
}

function fmt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>
