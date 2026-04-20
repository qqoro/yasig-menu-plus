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
  HELP_CARDS,
  ALL_CARD_IDS,
  type HelpSectionId,
} from "@/lib/helpCardRegistry";
import {
  useViewedHelpCards,
  useMarkHelpCardsViewed,
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
const { data: viewedHelpCards } = useViewedHelpCards();
const markCardsViewed = useMarkHelpCardsViewed();

// 이번 세션에서 본 카드 ID (페이지 이탈 시 일괄 저장)
const sessionViewedCards = new Set<string>();
// 반응형 트리거 (Set 변경 시 computed 갱신용)
const sessionViewedTick = ref(0);

// 읽지 않은 카드가 포함된 섹션 ID 목록 (세션에서 본 카드도 즉시 반영)
const unviewedSectionIds = computed(() => {
  void sessionViewedTick.value;
  const viewed = new Set([
    ...(viewedHelpCards.value || []),
    ...sessionViewedCards,
  ]);
  return (Object.entries(HELP_CARDS) as [HelpSectionId, readonly string[]][])
    .filter(([, cardIds]) => cardIds.some((id) => !viewed.has(id)))
    .map(([sectionId]) => sectionId);
});

// IntersectionObserver로 개별 카드 스크롤 추적
let observer: IntersectionObserver | null = null;

onMounted(() => {
  const contentEl = document.getElementById("help-content");
  if (!contentEl) return;

  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      for (const entry of visible) {
        const cardId = entry.target.id;
        if (ALL_CARD_IDS.includes(cardId)) {
          sessionViewedCards.add(cardId);
          sessionViewedTick.value++;
        }

        // 활성 섹션 추적 (카드 → 섹션 매핑)
        const sectionId = Object.entries(HELP_CARDS).find(([, ids]) =>
          (ids as readonly string[]).includes(cardId),
        )?.[0];
        if (sectionId) {
          activeId.value = sectionId;
        }
      }
    },
    {
      root: contentEl,
      rootMargin: "0px 0px -80% 0px",
      threshold: 0,
    },
  );

  // 모든 카드 요소 관찰
  for (const cardId of ALL_CARD_IDS) {
    const el = document.getElementById(cardId);
    if (el) observer.observe(el);
  }

  // 스크롤 바닥 도달 시 남은 카드 모두 읽음 처리
  contentEl.addEventListener("scroll", () => {
    const atBottom =
      contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight <
      50;
    if (atBottom) {
      for (const cardId of ALL_CARD_IDS) {
        sessionViewedCards.add(cardId);
      }
      sessionViewedTick.value++;
    }
  });
});

onUnmounted(() => {
  observer?.disconnect();

  // 세션에서 본 카드를 일괄 저장
  if (sessionViewedCards.size > 0) {
    markCardsViewed.mutate([...sessionViewedCards]);
  }
});

// 사이드바 클릭 → 스크롤 이동
function scrollToSection(id: string) {
  const firstCardId = HELP_CARDS[id as HelpSectionId]?.[0];
  if (firstCardId) {
    const el = document.getElementById(firstCardId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="flex items-center justify-between border-b px-4 py-2">
      <h1 class="text-base font-semibold">도움말</h1>
      <RouterLink to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="w-40 shrink-0 overflow-y-auto border-r">
        <HelpSidebar
          :sections="sections"
          :active-id="activeId"
          :unviewed-section-ids="unviewedSectionIds"
          @select="scrollToSection"
        />
      </div>

      <div id="help-content" class="flex-1 overflow-y-auto p-6">
        <div class="mx-auto flex max-w-3xl flex-col gap-6">
          <div>
            <HelpGettingStarted />
          </div>
          <div>
            <HelpGameManagement />
          </div>
          <div>
            <HelpCollectorSection />
          </div>
          <div>
            <HelpSearchFilter />
          </div>
          <div>
            <HelpImageCarousel />
          </div>
          <div>
            <HelpGameDetail />
          </div>
          <div>
            <HelpSpecialFeatures />
          </div>
          <div>
            <HelpDashboardDuplicates />
          </div>
          <div>
            <HelpSettings />
          </div>
          <div>
            <HelpShortcuts />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
