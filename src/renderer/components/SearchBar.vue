<script setup lang="ts">
import { Search, X } from "lucide-vue-next";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAutocomplete } from "../composables/useAutocomplete";

interface Props {
  modelValue: string;
  placeholder?: string;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "검색어를 입력하세요 (예: tag:RPG circle:name)",
});

const emit = defineEmits<Emits>();

// 자동완성 composable
const {
  showAutocomplete,
  inputValue,
  selectedIndex,
  isFocused,
  currentPrefix,
  suggestions,
  isLoadingSuggestions,
  handleInput: handleAutocompleteInput,
  selectSuggestion,
  handleKeyDown,
  closeAutocomplete,
  resetAutocomplete,
  showAutocompleteAtCursor,
} = useAutocomplete();

const inputRef = ref<HTMLInputElement | null>(null);
const autocompleteRef = ref<HTMLDivElement | null>(null);

// modelValue 변경 시 자동완성 상태 업데이트
watch(
  () => props.modelValue,
  (newValue) => {
    handleAutocompleteInput(newValue);
    inputValue.value = newValue;
  },
);

// 로컬 입력값 변경 시 emit
function updateInput(value: string): void {
  emit("update:modelValue", value);
  handleAutocompleteInput(value);
}

// 입력 처리
function handleInputChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  updateInput(value);
}

// 지우기 버튼
function clearInput(): void {
  updateInput("");
  inputRef.value?.focus();
}

// 자동완성 항목 선택
function selectItem(suggestion: string): void {
  // tag, circle, category (한글 포함)는 띄어쓰기를 _로 변환
  let finalSuggestion = suggestion;
  if (
    currentPrefix.value &&
    ["tag", "circle", "category", "태그", "서클", "카테고리"].includes(
      currentPrefix.value,
    )
  ) {
    finalSuggestion = suggestion.replace(/\s+/g, "_");
  }

  // 마지막 단어의 - 접두사 보존 (제외 검색)
  const lastWord = props.modelValue.substring(
    props.modelValue.lastIndexOf(" ") + 1,
  );
  const excludePrefix = lastWord.startsWith("-") ? "-" : "";

  // prefix가 있으면 prefix:value 형태로 만들기
  if (currentPrefix.value) {
    finalSuggestion = `${excludePrefix}${currentPrefix.value}:${finalSuggestion}`;
  } else if (excludePrefix && finalSuggestion.endsWith(":")) {
    // prefix 제안 단계(-t → tag:)에서도 - 보존
    finalSuggestion = `-${finalSuggestion}`;
  }

  const newValue = selectSuggestion(props.modelValue, finalSuggestion);
  // prefix 선택 단계(:로 끝남)가 아니면 공백 추가
  const withSpace = finalSuggestion.endsWith(":") ? newValue : newValue + " ";
  updateInput(withSpace);

  // focus 유지
  nextTick(() => {
    inputRef.value?.focus();
  });
}

// 포커스 아웃 시 자동완성 닫기 (지연시켜 클릭 이벤트 처리)
function handleFocusOut(event: FocusEvent): void {
  const relatedTarget = event.relatedTarget as HTMLElement;
  const autocompleteEl = autocompleteRef.value;

  // 자동완성 내부로 이동하는 경우 닫지 않음
  if (autocompleteEl && autocompleteEl.contains(relatedTarget)) {
    return;
  }

  closeAutocomplete();
}

// 키보드 이벤트 처리 (Ctrl+Space 지원)
function handleKeydown(event: KeyboardEvent): void {
  // Ctrl+Space: 현재 커서 위치의 자동완성 표시
  if (event.ctrlKey && event.code === "Space") {
    event.preventDefault();
    showAutocompleteAtCursor(props.modelValue);
    return;
  }

  // Tab 키로 자동완성 선택
  if (event.key === "Tab" && showAutocomplete && suggestions.value.length > 0) {
    event.preventDefault();
    const selected = suggestions.value[selectedIndex.value];
    if (selected) {
      selectItem(selected);
    }
    return;
  }

  // Enter 키로 자동완성 선택
  if (
    event.key === "Enter" &&
    showAutocomplete &&
    suggestions.value.length > 0
  ) {
    event.preventDefault();
    const selected = suggestions.value[selectedIndex.value];
    if (selected) {
      selectItem(selected);
    }
    return;
  }

  // 그 외 키는 기존 핸들러로 전달
  handleKeyDown(event);
}

// 외부 클릭 시 자동완성 닫기
function handleClickOutside(event: MouseEvent): void {
  const autocompleteEl = autocompleteRef.value;
  const inputEl = inputRef.value;

  if (autocompleteEl && inputEl) {
    const target = event.target as HTMLElement;
    if (!autocompleteEl.contains(target) && target !== inputEl) {
      closeAutocomplete();
    }
  }
}

// 포커스 상태 추적
function handleFocus(): void {
  isFocused.value = true;
}

function handleBlur(): void {
  isFocused.value = false;
}

// 마운트 시 외부 클릭 리스너 등록
onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

// 언마운트 시 리스너 제거
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// 포커스 메서드 노출 (부모 컴포넌트에서 호출 가능)
function focus(): void {
  inputRef.value?.focus();
}

defineExpose({
  focus,
});
</script>

<template>
  <div class="relative w-full">
    <!-- 입력 필드 -->
    <div class="relative flex items-center">
      <Search
        :size="18"
        class="text-muted-foreground pointer-events-none absolute left-3"
      />
      <input
        ref="inputRef"
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-10 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        @input="handleInputChange"
        @keydown="handleKeydown"
        @focusout="handleFocusOut"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <button
        v-if="modelValue"
        type="button"
        class="text-muted-foreground hover:text-foreground absolute right-3 transition-colors"
        @click="clearInput"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- 자동완성 팝업 -->
    <div
      v-if="showAutocomplete && suggestions.length > 0"
      ref="autocompleteRef"
      class="bg-popover border-border absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border shadow-lg"
    >
      <div
        v-for="(suggestion, index) in suggestions"
        :key="index"
        class="hover:bg-accent hover:text-accent-foreground cursor-pointer px-3 py-2 text-sm transition-colors"
        :class="{ 'bg-accent text-accent-foreground': index === selectedIndex }"
        @mousedown.prevent="selectItem(suggestion)"
      >
        <template v-if="currentPrefix"
          >{{ currentPrefix }}:<span class="font-medium">{{
            suggestion
          }}</span></template
        >
        <template v-else>{{ suggestion }}</template>
      </div>
    </div>

    <!-- 로딩 상태 -->
    <div
      v-if="isLoadingSuggestions && showAutocomplete"
      class="bg-popover border-border text-muted-foreground absolute z-50 mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-lg"
    >
      검색 중...
    </div>
  </div>
</template>
