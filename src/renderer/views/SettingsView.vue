<script setup lang="ts">
import { nextTick, onMounted } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "@/components/PageHeader.vue";
import AppSettingsSection from "@/components/settings/AppSettingsSection.vue";
import AiIntegrationSection from "@/components/settings/AiIntegrationSection.vue";
import DataSection from "@/components/settings/DataSection.vue";
import LibrarySection from "@/components/settings/LibrarySection.vue";
import SystemSection from "@/components/settings/SystemSection.vue";

const route = useRoute();

// ?focus=<id> 로 들어오면 해당 카드(id="settings-<id>")로 스크롤하고 잠깐 강조한다
onMounted(async () => {
  const focus = route.query.focus;
  if (typeof focus !== "string") return;
  await nextTick();
  const el = document.getElementById(`settings-${focus}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
});
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
