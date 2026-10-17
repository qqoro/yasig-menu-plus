<script setup lang="ts">
import PageHeader from "@/components/PageHeader.vue";
import AppSettingsSection from "@/components/settings/AppSettingsSection.vue";
import AiIntegrationSection from "@/components/settings/AiIntegrationSection.vue";
import DataSection from "@/components/settings/DataSection.vue";
import LibrarySection from "@/components/settings/LibrarySection.vue";
import SystemSection from "@/components/settings/SystemSection.vue";
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <PageHeader title="설정" />

    <!-- 스크롤 영역 -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="flex flex-col gap-8">
        <LibrarySection />
        <DataSection />
        <AppSettingsSection />
        <AiIntegrationSection />
        <SystemSection />
      </div>
    </div>
  </div>
</template>
