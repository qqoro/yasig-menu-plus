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
  isSelectionMode?: boolean;
  selectedCount?: number;
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
  (e: "batch-favorite", value: boolean): void;
  (e: "batch-clear", value: boolean): void;
  (e: "batch-hidden", value: boolean): void;
  (e: "batch-delete"): void;
}

withDefaults(defineProps<Props>(), {
  isSelectionMode: false,
  selectedCount: 0,
});
const emit = defineEmits<Emits>();
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <!-- 다중 선택 모드 -->
      <template v-if="isSelectionMode && selectedCount > 0">
        <ContextMenuItem disabled class="text-muted-foreground text-xs">
          {{ selectedCount }}개 게임 선택됨
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="emit('batch-favorite', true)">
          <Star :size="14" />
          일괄 즐겨찾기 추가
        </ContextMenuItem>
        <ContextMenuItem @select="emit('batch-favorite', false)">
          <StarOff :size="14" />
          일괄 즐겨찾기 해제
        </ContextMenuItem>
        <ContextMenuItem @select="emit('batch-clear', true)">
          <Flag :size="14" />
          일괄 클리어 표시
        </ContextMenuItem>
        <ContextMenuItem @select="emit('batch-clear', false)">
          <FlagOff :size="14" />
          일괄 클리어 해제
        </ContextMenuItem>
        <ContextMenuItem @select="emit('batch-hidden', true)">
          <EyeOff :size="14" />
          일괄 숨기기
        </ContextMenuItem>
        <ContextMenuItem @select="emit('batch-hidden', false)">
          <Eye :size="14" />
          일괄 숨김 해제
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" @select="emit('batch-delete')">
          <Trash2 :size="14" />
          일괄 삭제
        </ContextMenuItem>
      </template>

      <!-- 단일 선택 모드 (기존 메뉴) -->
      <template v-else>
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
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
