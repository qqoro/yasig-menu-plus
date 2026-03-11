<script setup lang="ts">
import {
  CheckSquare,
  Eye,
  EyeOff,
  Flag,
  Star,
  Trash2,
  X,
} from "lucide-vue-next";
import { Button } from "./ui/button";

interface Props {
  selectedCount: number;
  isAllSelected: boolean;
  isPending?: boolean;
}

interface Emits {
  (e: "select-all"): void;
  (e: "clear-selection"): void;
  (e: "batch-favorite", value: boolean): void;
  (e: "batch-clear", value: boolean): void;
  (e: "batch-hidden", value: boolean): void;
  (e: "batch-delete"): void;
}

withDefaults(defineProps<Props>(), {
  isPending: false,
});

defineEmits<Emits>();
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    leave-active-class="transition-all duration-150 ease-in"
    enter-from-class="translate-y-full opacity-0"
    leave-to-class="translate-y-full opacity-0"
  >
    <div v-if="selectedCount > 0" class="bg-card border-t shadow-lg">
      <div class="flex flex-wrap items-center gap-2 px-4 py-2">
        <!-- 선택 정보 및 전체/해제 -->
        <span class="text-sm font-medium whitespace-nowrap">
          {{ selectedCount }}개 선택됨
        </span>
        <Button
          variant="ghost"
          size="sm"
          @click="$emit('select-all')"
          :disabled="isPending"
        >
          <CheckSquare :size="14" />
          {{ isAllSelected ? "전체 해제" : "전체 선택" }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          @click="$emit('clear-selection')"
          :disabled="isPending"
        >
          <X :size="14" />
          선택 해제
        </Button>

        <!-- 구분선 -->
        <div class="bg-border h-5 w-px" />

        <!-- 일괄 작업 버튼들 -->
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-favorite', true)"
          :disabled="isPending"
          title="즐겨찾기 추가"
        >
          <Star :size="14" />
          즐겨찾기
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-favorite', false)"
          :disabled="isPending"
          title="즐겨찾기 해제"
        >
          <Star :size="14" class="opacity-50" />
          즐겨찾기 해제
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-clear', true)"
          :disabled="isPending"
          title="클리어 표시"
        >
          <Flag :size="14" />
          클리어
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-clear', false)"
          :disabled="isPending"
          title="클리어 해제"
        >
          <Flag :size="14" class="opacity-50" />
          클리어 해제
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-hidden', true)"
          :disabled="isPending"
          title="숨기기"
        >
          <EyeOff :size="14" />
          숨기기
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('batch-hidden', false)"
          :disabled="isPending"
          title="숨김 해제"
        >
          <Eye :size="14" />
          숨김 해제
        </Button>
        <Button
          variant="destructive"
          size="sm"
          @click="$emit('batch-delete')"
          :disabled="isPending"
          title="삭제"
        >
          <Trash2 :size="14" />
          삭제
        </Button>
      </div>
    </div>
  </Transition>
</template>
