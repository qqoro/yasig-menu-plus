<script setup lang="ts">
import { cn } from "@/lib/utils";
import { Star } from "lucide-vue-next";
import { computed } from "vue";

interface Props {
  rating: number | null;
  size?: "sm" | "md" | "lg";
  showEmpty?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  rating: null,
  size: "sm",
  showEmpty: true,
});

// 별 크기 클래스
const sizeClasses = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

// 5개의 별 상태 (각각 true = 가득, false = 비어있음)
const starStates = computed<boolean[]>(() => {
  if (props.rating === null && !props.showEmpty) return [];

  const states: boolean[] = [];
  const value = props.rating ?? 0;

  for (let i = 1; i <= 5; i++) {
    states.push(i <= value);
  }
  return states;
});
</script>

<template>
  <div v-if="rating !== null || showEmpty" class="flex items-center gap-px">
    <div
      v-for="(filled, index) in starStates"
      :key="index"
      class="relative"
      :class="sizeClasses[size]"
    >
      <Star
        :class="
          cn(
            'h-full w-full',
            filled
              ? 'fill-yellow-400 text-yellow-400'
              : showEmpty
                ? 'text-muted-foreground/30 fill-transparent'
                : 'hidden',
          )
        "
      />
    </div>
  </div>
</template>
