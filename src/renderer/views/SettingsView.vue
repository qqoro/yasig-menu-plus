<script setup lang="ts">
import { Home } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import AppSettingsSection from "@/components/settings/AppSettingsSection.vue";
import DataSection from "@/components/settings/DataSection.vue";
import LibrarySection from "@/components/settings/LibrarySection.vue";
import SystemSection from "@/components/settings/SystemSection.vue";
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 도구 모음 -->
    <div class="flex items-center justify-between border-b px-4 py-2">
      <h1 class="text-base font-semibold">설정</h1>
      <RouterLink to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>

    <!-- 스크롤 영역 -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="flex flex-col gap-8">
        <LibrarySection />
        <DataSection />
        <AppSettingsSection />
        <SystemSection />
      </div>
    </div>
  </div>
</template>
