<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { ref } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from "@/lib/utils"

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})

// v-model은 한글 등 IME 조합 중 입력을 반영하지 않아, 자동완성이 글자를 완성한 뒤에야 반응한다.
// 조합 중 입력도 바로 모델에 반영한다 (조합 중에는 v-model이 el.value를 덮어쓰지 않아 입력이 깨지지 않는다)
function handleComposingInput(event: Event) {
  if (!(event as InputEvent).isComposing) return
  modelValue.value = (event.target as HTMLInputElement).value
}

// 조합 중 Enter는 글자 확정용 → 부모의 Enter 처리(등록·검색)로 넘기지 않는다.
// 넘기면 부모가 입력값을 비워도 조합이 끝나며 마지막 글자가 다시 들어온다
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing && event.key === "Enter") event.stopImmediatePropagation()
}

// 네이티브 input 엘리먼트와 focus 메서드 노출 (부모에서 ref.focus()로 사용)
const inputEl = ref<HTMLInputElement | null>(null)

defineExpose({
  inputEl,
  focus: () => inputEl.value?.focus(),
})
</script>

<template>
  <input
    ref="inputEl"
    v-model="modelValue"
    data-slot="input"
    @input="handleComposingInput"
    @keydown="handleKeydown"
    :class="cn(
      'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
      props.class,
    )"
  >
</template>
