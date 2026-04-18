<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

export interface HelpSection {
  id: string;
  icon: LucideIcon;
  label: string;
}

defineProps<{
  sections: HelpSection[];
  activeId: string;
  unviewedIds: string[];
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();
</script>

<template>
  <nav class="flex flex-col gap-1 p-2">
    <Button
      v-for="section in sections"
      :key="section.id"
      :variant="activeId === section.id ? 'secondary' : 'ghost'"
      size="sm"
      class="justify-start"
      @click="emit('select', section.id)"
    >
      <component :is="section.icon" :size="14" />
      <span class="relative">
        {{ section.label }}
        <span
          v-if="unviewedIds.includes(section.id)"
          class="bg-destructive absolute -top-1 -right-2 inline-block size-1.5 rounded-full"
        />
      </span>
    </Button>
  </nav>
</template>
