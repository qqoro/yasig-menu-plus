<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import licensesData from "@/assets/licenses.json";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

type PackageInfo = {
  name: string;
  versions: string[];
  license: string;
  author?: string;
  description?: string;
  homepage?: string;
};

const packages = computed(() => {
  const result: (PackageInfo & { licenseText: string | null })[] = [];
  const texts = licensesData.licenseTexts as Record<string, string>;

  for (const [type, pkgs] of Object.entries(
    licensesData.licenses as Record<string, PackageInfo[]>,
  )) {
    for (const pkg of pkgs) {
      result.push({ ...pkg, licenseText: texts[type] ?? null });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
});

const expandedPkg = ref<string | null>(null);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[80vh] max-w-2xl flex-col">
      <DialogHeader>
        <DialogTitle>오픈소스 라이선스</DialogTitle>
        <DialogDescription>
          이 앱은 다음 오픈소스 소프트웨어를 사용합니다
        </DialogDescription>
      </DialogHeader>

      <div class="-mx-6 flex-1 overflow-y-auto px-6">
        <div class="flex flex-col">
          <div v-for="pkg in packages" :key="pkg.name">
            <button
              class="hover:bg-muted/50 flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-sm"
              @click="expandedPkg = expandedPkg === pkg.name ? null : pkg.name"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-xs">
                {{ pkg.name }}
              </span>
              <span class="text-muted-foreground shrink-0 text-xs">
                {{ pkg.license }}
              </span>
            </button>

            <div
              v-if="expandedPkg === pkg.name && pkg.licenseText"
              class="border-b px-2 py-2"
            >
              <pre
                class="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs leading-relaxed whitespace-pre-wrap"
                >{{ pkg.licenseText }}</pre
              >
            </div>
          </div>
        </div>
      </div>

      <div class="border-border flex justify-end border-t pt-4">
        <Button variant="outline" @click="emit('update:open', false)">
          닫기
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
