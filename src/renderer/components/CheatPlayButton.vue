<script setup lang="ts">
import { computed } from "vue";
import { Play, Loader2, ChevronDown, Zap } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const props = withDefaults(
  defineProps<{
    gamePath: string;
    isRpgMaker?: boolean;
    isPlaying?: boolean;
    isPlayingCheat?: boolean;
    hasExecutable?: boolean;
    disabled?: boolean;
    size?: "sm" | "default";
  }>(),
  {
    isRpgMaker: false,
    isPlaying: false,
    isPlayingCheat: false,
    hasExecutable: true,
    disabled: false,
    size: "default",
  },
);

const emit = defineEmits<{
  play: [];
  "play-cheat": [];
}>();

const isCompact = computed(() => props.size === "sm");

const playLabel = computed(() => {
  if (props.isPlaying) return props.hasExecutable ? "실행 중..." : "재생 중...";
  return props.hasExecutable ? "실행" : "재생";
});
</script>

<template>
  <!-- RPG Maker 게임: 드롭다운 (일반 실행 + 치트 모드) -->
  <DropdownMenu v-if="isRpgMaker">
    <div class="flex w-full">
      <!-- 기본 실행 버튼 -->
      <Button
        @click="emit('play')"
        :disabled="isPlaying || isPlayingCheat || disabled"
        :size="size"
        class="flex-1 rounded-r-none"
        :title="hasExecutable === false ? '미디어 재생' : '게임 실행'"
      >
        <Loader2
          v-if="isPlaying"
          :size="isCompact ? 12 : 16"
          class="animate-spin"
        />
        <Play v-else :size="isCompact ? 12 : 16" />
        {{ playLabel }}
      </Button>
      <!-- 드롭다운 트리거 -->
      <DropdownMenuTrigger as-child>
        <Button
          :disabled="isPlaying || isPlayingCheat || disabled"
          :size="size"
          class="bg-primary/80 rounded-l-none border-l-0 px-1"
        >
          <ChevronDown :size="isCompact ? 12 : 14" />
        </Button>
      </DropdownMenuTrigger>
    </div>

    <DropdownMenuContent align="end">
      <!-- 일반 실행 -->
      <DropdownMenuItem @select="emit('play')">
        <Play :size="14" />
        {{ hasExecutable === false ? "일반 재생" : "일반 실행" }}
      </DropdownMenuItem>

      <!-- 치트 모드 실행 -->
      <DropdownMenuItem @select="emit('play-cheat')" :disabled="isPlayingCheat">
        <Loader2 v-if="isPlayingCheat" :size="14" class="animate-spin" />
        <Zap v-else :size="14" />
        {{ isPlayingCheat ? "치트 실행 중..." : "치트 모드로 실행" }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <!-- 일반 게임: 단일 실행 버튼 -->
  <Button
    v-else
    class="w-full"
    @click="emit('play')"
    :disabled="isPlaying || disabled"
    :size="size"
    :title="hasExecutable === false ? '미디어 재생' : '게임 실행'"
  >
    <Loader2
      v-if="isPlaying"
      :size="isCompact ? 12 : 16"
      class="animate-spin"
    />
    <Play v-else :size="isCompact ? 12 : 16" />
    {{ playLabel }}
  </Button>
</template>
