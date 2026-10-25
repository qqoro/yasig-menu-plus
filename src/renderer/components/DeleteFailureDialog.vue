<script setup lang="ts">
/**
 * 게임 삭제 실패 모달
 *
 * 휴지통 이동에 실패한 게임을 모아 보여주고 그 자리에서 영구 삭제할 수 있게 한다.
 * 영구 삭제까지 실패했다면 더 시도할 방법이 없으므로 닫기만 둔다
 */
import { AlertTriangle, Loader2 } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useDeleteGames } from "../composables/useDuplicates";
import { useDeleteFailureStore } from "../stores/deleteFailureStore";

const store = useDeleteFailureStore();
const { open, failed, deletedCount, permanent } = storeToRefs(store);
const deleteGames = useDeleteGames();

async function deletePermanently() {
  const paths = failed.value.map((f) => f.path);
  open.value = false;
  // 다시 실패하면 onSuccess가 이 모달을 영구 삭제 실패 상태로 다시 띄운다
  await deleteGames.mutateAsync({ paths, permanent: true });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle
          class="flex items-center gap-2"
          :class="permanent ? 'text-destructive' : 'text-yellow-500'"
        >
          <AlertTriangle class="h-5 w-5" />
          {{
            deletedCount > 0
              ? "일부 게임을 삭제하지 못했습니다"
              : "게임을 삭제하지 못했습니다"
          }}
        </DialogTitle>
        <DialogDescription>
          <template v-if="permanent">
            아래 게임은 영구 삭제도 실패해 그대로 남아 있습니다. 게임이 실행
            중이거나 폴더가 다른 프로그램에서 열려 있는지 확인해 주세요.
          </template>
          <template v-else>
            아래 게임은 휴지통으로 옮기지 못해 그대로 남아 있습니다. 네트워크
            드라이브(NAS)처럼 휴지통이 없는 위치일 수 있습니다.
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap gap-2 text-xs">
        <span
          v-if="deletedCount > 0"
          class="rounded-full border px-2.5 py-0.5 text-green-500"
        >
          {{ permanent ? "영구 삭제" : "휴지통으로 이동" }}
          {{ deletedCount }}개
        </span>
        <span class="rounded-full border px-2.5 py-0.5 text-yellow-500">
          실패 {{ failed.length }}개
        </span>
      </div>

      <div class="flex flex-col gap-1.5">
        <div
          v-for="item in failed"
          :key="item.path"
          class="bg-muted/40 flex flex-col gap-0.5 rounded-lg border px-3 py-2"
        >
          <span class="truncate text-sm font-medium">{{ item.title }}</span>
          <span class="text-muted-foreground text-xs break-all">
            {{ item.path }}
          </span>
          <span class="text-xs text-yellow-500">{{ item.message }}</span>
        </div>
      </div>

      <p
        v-if="!permanent"
        class="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
      >
        영구 삭제하면 휴지통을 거치지 않으므로
        <strong>복구할 수 없습니다.</strong>
      </p>

      <DialogFooter>
        <Button variant="outline" @click="open = false">닫기</Button>
        <Button
          v-if="!permanent"
          variant="destructive"
          :disabled="deleteGames.isPending.value"
          @click="deletePermanently"
        >
          <Loader2
            v-if="deleteGames.isPending.value"
            class="h-4 w-4 animate-spin"
          />
          영구 삭제 ({{ failed.length }}개)
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
