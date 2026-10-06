<template>
  <section class="panel inbox-table" style="margin-bottom:14px">
    <h3>{{ title }}（汛前调度桌交班下发）</h3>
    <p v-if="!todos.length" class="page-desc">暂无调度桌交班下发的待办。接班确认后，本页只接收{{ selfLabel }}批次，与另一页互不相混。</p>
    <template v-else>
      <div class="inbox-banner">
        共 {{ todos.length }} 条下发待办，其中待处理 <strong>{{ pendingCount }}</strong> 条；
        来自交班快照，改派依据随单保留。
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>关联编号</th><th>事项</th><th>责任网格/时刻</th><th>责任人</th><th>调度依据</th><th>下发时间</th><th>状态</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.id">
            <td>{{ todo.refCode }}</td>
            <td>{{ todo.title }}<span v-if="todo.abnormal" class="abnormal-cell"> ●异常</span></td>
            <td style="white-space:nowrap">{{ todo.gridName }} {{ formatHour(todo.hour) }}</td>
            <td>{{ todo.owner }}</td>
            <td>{{ todo.basis }}</td>
            <td style="white-space:nowrap">{{ fmt(todo.deliveredAt) }}</td>
            <td>
              <span class="status-pill" :class="todo.status === '待办' ? 'pill-wait' : 'pill-ok'">{{ todo.status }}</span>
            </td>
            <td>
              <button v-if="todo.status === '待办'" class="link" type="button" @click="$emit('complete', todo.id)">标记已处理</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { DispatchTodo } from '@/data/dispatch-types'
import { formatHour } from '@/api/dispatch-service'

const props = defineProps<{
  title: string
  selfLabel: string
  todos: DispatchTodo[]
}>()
defineEmits<{ (event: 'complete', id: string): void }>()

const pendingCount = computed(() => props.todos.filter((todo) => todo.status === '待办').length)

function fmt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
</script>
