<script setup lang="ts">
import {
  Eye,
  EyeOff,
  Flag,
  FlagOff,
  FolderOpen,
  Globe,
  Info,
  Play,
  Star,
  StarOff,
  Trash2,
} from "lucide-vue-next";
import type { GameItem } from "../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";

interface Props {
  game: GameItem;
}

interface Emits {
  (e: "play", game: GameItem): void;
  (e: "open-folder", game: GameItem): void;
  (e: "toggle-favorite", game: GameItem): void;
  (e: "toggle-clear", game: GameItem): void;
  (e: "toggle-hidden", game: GameItem): void;
  (e: "show-detail", game: GameItem): void;
  (e: "open-original-site", game: GameItem): void;
  (e: "delete", game: GameItem): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48">
      <ContextMenuItem @select="emit('play', game)">
        <Play :size="14" />
        실행
      </ContextMenuItem>
      <ContextMenuItem @select="emit('open-folder', game)">
        <FolderOpen :size="14" />
        폴더 열기
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="emit('toggle-favorite', game)">
        <Star v-if="game.isFavorite" :size="14" class="fill-current" />
        <StarOff v-else :size="14" />
        {{ game.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가" }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('toggle-clear', game)">
        <Flag v-if="game.isClear" :size="14" class="fill-current" />
        <FlagOff v-else :size="14" />
        {{ game.isClear ? "클리어 취소" : "클리어 표시" }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('toggle-hidden', game)">
        <EyeOff v-if="game.isHidden" :size="14" />
        <Eye v-else :size="14" />
        {{ game.isHidden ? "숨김 해제" : "숨기기" }}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="emit('show-detail', game)">
        <Info :size="14" />
        상세 정보
      </ContextMenuItem>
      <ContextMenuItem
        v-if="game.provider && game.externalId"
        @select="emit('open-original-site', game)"
      >
        <Globe :size="14" />
        원본 사이트
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem variant="destructive" @select="emit('delete', game)">
        <Trash2 :size="14" />
        삭제
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
