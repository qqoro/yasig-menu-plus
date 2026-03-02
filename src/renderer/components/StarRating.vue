<script setup lang="ts">
import { cn } from "@/lib/utils";
import { Star } from "lucide-vue-next";
import { computed, ref } from "vue";

interface Props {
  modelValue?: number | null;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  readonly: false,
  size: "md",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: number | null): void;
}>();

// 호버 중인 별점 (1-5)
const hoverValue = ref<number | null>(null);

// 표시할 별점 (호버 중이면 hoverValue, 아니면 modelValue)
const displayValue = computed(() => hoverValue.value ?? props.modelValue ?? 0);

// 별 크기 클래스
const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
};

// 5개의 별 상태 (각각 0 = 비어있음, 1 = 가득)
const starStates = computed<boolean[]>(() => {
  const states: boolean[] = [];
  const value = displayValue.value;

  for (let i = 1; i <= 5; i++) {
    states.push(i <= value);
  }
  return states;
});

// 별 클릭 핸들러
function handleStarClick(rating: number) {
  if (props.readonly) return;

  // 같은 값 다시 클릭 시 제거
  if (props.modelValue === rating) {
    emit("update:modelValue", null);
  } else {
    emit("update:modelValue", rating);
  }
}

// 호버 시작
function handleMouseEnter(rating: number) {
  if (props.readonly) return;
  hoverValue.value = rating;
}

// 호버 종료
function handleMouseLeave() {
  hoverValue.value = null;
}

// 현재 별점 텍스트
const ratingText = computed(() => {
  if (props.modelValue === null) return "별점 없음";
  return `${props.modelValue} / 5`;
});
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-px">
      <div
        v-for="(filled, index) in starStates"
        :key="index"
        class="relative"
        :class="sizeClasses[size]"
      >
        <button
          v-if="!readonly"
          type="button"
          class="absolute inset-0 cursor-pointer transition-transform hover:scale-110"
          @click="handleStarClick(index + 1)"
          @mouseenter="handleMouseEnter(index + 1)"
          @mouseleave="handleMouseLeave"
          :title="`${index + 1}점`"
        />
        <Star
          :class="
            cn(
              'h-full w-full transition-colors',
              filled
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground fill-transparent',
            )
          "
        />
      </div>
    </div>
    <p v-if="!readonly" class="text-muted-foreground text-xs">
      {{ ratingText }}
    </p>
  </div>
</template>
