<script setup lang="ts">
import {
  BarChart3,
  Gamepad2,
  Image,
  Home,
  Search,
  Settings,
  Sparkles,
  Type,
  Zap,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import HelpSidebar, {
  type HelpSection,
} from "@/components/help/HelpSidebar.vue";
import HelpGettingStarted from "@/components/help/sections/HelpGettingStarted.vue";
import HelpGameManagement from "@/components/help/sections/HelpGameManagement.vue";
import HelpCollectorSection from "@/components/help/sections/HelpCollectorSection.vue";
import HelpSearchFilter from "@/components/help/sections/HelpSearchFilter.vue";
import HelpImageCarousel from "@/components/help/sections/HelpImageCarousel.vue";
import HelpGameDetail from "@/components/help/sections/HelpGameDetail.vue";
import HelpSpecialFeatures from "@/components/help/sections/HelpSpecialFeatures.vue";
import HelpDashboardDuplicates from "@/components/help/sections/HelpDashboardDuplicates.vue";
import HelpSettings from "@/components/help/sections/HelpSettings.vue";
import HelpShortcuts from "@/components/help/sections/HelpShortcuts.vue";
import {
  useMarkHelpSectionViewed,
  useViewedHelpSections,
} from "@/composables/useHelpRedDot";

const sections: HelpSection[] = [
  { id: "getting-started", icon: Home, label: "시작하기" },
  { id: "game-management", icon: Gamepad2, label: "게임 관리" },
  { id: "collectors", icon: Search, label: "썸네일 수집" },
  { id: "search-filter", icon: Zap, label: "검색과 필터링" },
  { id: "image-carousel", icon: Image, label: "이미지 캐러셀" },
  { id: "game-detail", icon: Search, label: "게임 상세 정보" },
  { id: "special-features", icon: Sparkles, label: "특별 기능" },
  { id: "dashboard", icon: BarChart3, label: "대시보드" },
  { id: "settings", icon: Settings, label: "설정 안내" },
  { id: "shortcuts", icon: Type, label: "단축키" },
];

const activeId = ref(sections[0].id);

// 레드닷 관련
const { data: viewedHelpSections } = useViewedHelpSections();
const markViewed = useMarkHelpSectionViewed();

// 읽지 않은 섹션 ID 목록
const unviewedIds = computed(() => {
  const viewed = viewedHelpSections.value || [];
  return sections.filter((s) => !viewed.includes(s.id)).map((s) => s.id);
});

// IntersectionObserver로 스크롤 추적
let observer: IntersectionObserver | null = null;

onMounted(() => {
  const contentEl = document.getElementById("help-content");
  if (!contentEl) return;

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length > 0) {
        const topEntry = visible.reduce((prev, curr) =>
          prev.boundingClientRect.top < curr.boundingClientRect.top
            ? prev
            : curr,
        );
        activeId.value = topEntry.target.id;
        // 레드닷: 뷰포트에 들어온 섹션 읽음 처리
        markViewed.mutate(topEntry.target.id);
      }
    },
    {
      root: contentEl,
      rootMargin: "0px 0px -80% 0px",
      threshold: 0,
    },
  );

  for (const section of sections) {
    const el = document.getElementById(section.id);
    if (el) observer.observe(el);
  }
});

onUnmounted(() => {
  observer?.disconnect();
});

// 사이드바 클릭 → 스크롤 이동
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 도구 모음 -->
    <div class="flex items-center justify-between border-b px-4 py-2">
      <h1 class="text-base font-semibold">도움말</h1>
      <RouterLink to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>

    <!-- 사이드바 + 콘텐츠 -->
    <div class="flex min-h-0 flex-1">
      <!-- 사이드바 -->
      <div class="w-40 shrink-0 overflow-y-auto border-r">
        <HelpSidebar
          :sections="sections"
          :active-id="activeId"
          :unviewed-ids="unviewedIds"
          @select="scrollToSection"
        />
      </div>

      <!-- 콘텐츠 -->
      <div id="help-content" class="flex-1 overflow-y-auto p-6">
        <div class="mx-auto flex max-w-3xl flex-col gap-6">
          <div id="getting-started">
            <HelpGettingStarted />
          </div>
          <div id="game-management">
            <HelpGameManagement />
          </div>
          <div id="collectors">
            <HelpCollectorSection />
          </div>
          <div id="search-filter">
            <HelpSearchFilter />
          </div>
          <div id="image-carousel">
            <HelpImageCarousel />
          </div>
          <div id="game-detail">
            <HelpGameDetail />
          </div>
          <div id="special-features">
            <HelpSpecialFeatures />
          </div>
          <div id="dashboard">
            <HelpDashboardDuplicates />
          </div>
          <div id="settings">
            <HelpSettings />
          </div>
          <div id="shortcuts">
            <HelpShortcuts />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
