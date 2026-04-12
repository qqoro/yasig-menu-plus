import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

/**
 * useRandomSelect composable 테스트
 * 실행: pnpm test -- src/renderer/composables/__tests__/useRandomSelect.test.ts
 */

// ========== 모킹 ==========

// toast 모킹
vi.mock("vue-sonner", () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// useRandomGameMutation 모킹 — 인라인 팩토리로 호이스팅 문제 해결
const mockMutateAsync = vi.fn();

vi.mock("../useGames", () => ({
  useRandomGameMutation: () => ({
    mutateAsync: (...args: any[]) => mockMutateAsync(...args),
  }),
}));

// 모킹 후 import
import { toast } from "vue-sonner";
import { useRandomSelect } from "../useRandomSelect";

describe("useRandomSelect", () => {
  /** 기본 옵션 생성 헬퍼 */
  function createOptions(
    overrides: Partial<Parameters<typeof useRandomSelect>[0]> = {},
  ) {
    return {
      activeLibraryPaths: computed(() => [
        "/library/path1",
        "/library/path2",
      ]) as any,
      searchQuery: ref(""),
      filters: computed(() => ({})) as any,
      sortBy: computed(() => "title") as any,
      sortOrder: computed(() => "asc") as any,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 게임 없음
    mockMutateAsync.mockResolvedValue({ game: null });
  });

  it("라이브러리 경로가 없으면 warning 토스트 후 리턴한다 (mutation 호출 안함)", async () => {
    const options = createOptions({
      activeLibraryPaths: computed(() => []) as any,
    });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(toast.warning).toHaveBeenCalledWith("라이브러리 경로가 없습니다.");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("라이브러리 경로가 null이면 warning 토스트 후 리턴한다", async () => {
    const options = createOptions({
      activeLibraryPaths: computed(() => null as any) as any,
    });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(toast.warning).toHaveBeenCalledWith("라이브러리 경로가 없습니다.");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("특별 검색어가 없으면 query=undefined로 mutation을 호출한다", async () => {
    const searchQuery = ref("일반 검색어");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: expect.objectContaining({
          query: undefined,
        }),
      }),
    );
  });

  it("특별 검색어(tag:, circle:, provider:)가 있으면 해당 필터만 query로 전달한다", async () => {
    const searchQuery = ref("tag:RPG 일반텍스트 circle:테스트 provider:DLsite");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.searchQuery.query).toContain("tag:RPG");
    expect(callArgs.searchQuery.query).toContain("circle:테스트");
    expect(callArgs.searchQuery.query).toContain("provider:DLsite");
    expect(callArgs.searchQuery.query).not.toContain("일반텍스트");
  });

  it("id: 필터도 특별 검색어로 추출된다", async () => {
    const searchQuery = ref("id:12345 텍스트");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.searchQuery.query).toContain("id:12345");
    expect(callArgs.searchQuery.query).not.toContain("텍스트");
  });

  it("category: 필터도 특별 검색어로 추출된다", async () => {
    const searchQuery = ref("category:액션 다른텍스트");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.searchQuery.query).toContain("category:액션");
    expect(callArgs.searchQuery.query).not.toContain("다른텍스트");
  });

  it("게임이 반환되면 translatedTitle > title > originalTitle 순으로 검색어를 설정한다", async () => {
    mockMutateAsync.mockResolvedValue({
      game: {
        path: "/game/1",
        title: "게임제목",
        originalTitle: "オリジナルタイトル",
        translatedTitle: "번역된제목",
      },
    });

    const searchQuery = ref("");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(searchQuery.value).toBe("번역된제목");
  });

  it("translatedTitle이 null이면 title을 검색어로 설정한다", async () => {
    mockMutateAsync.mockResolvedValue({
      game: {
        path: "/game/2",
        title: "게임제목",
        originalTitle: "オリジナルタイトル",
        translatedTitle: null,
      },
    });

    const searchQuery = ref("");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(searchQuery.value).toBe("게임제목");
  });

  it("특별 검색어 + 게임 반환 시 '특별필터 게임제목' 형식으로 검색어를 설정한다", async () => {
    mockMutateAsync.mockResolvedValue({
      game: {
        path: "/game/1",
        title: "테스트게임",
        originalTitle: "テストゲーム",
        translatedTitle: null,
      },
    });

    const searchQuery = ref("tag:RPG circle:서클명");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(searchQuery.value).toContain("tag:RPG");
    expect(searchQuery.value).toContain("circle:서클명");
    expect(searchQuery.value).toContain("테스트게임");
  });

  it("게임 반환 시 성공 토스트를 표시한다", async () => {
    mockMutateAsync.mockResolvedValue({
      game: {
        path: "/game/1",
        title: "멋진게임",
        originalTitle: "素晴らしいゲーム",
        translatedTitle: null,
      },
    });

    const searchQuery = ref("");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(toast.success).toHaveBeenCalledWith("멋진게임을(를) 선택했습니다.");
  });

  it("게임이 null이면 warning 토스트를 표시한다", async () => {
    mockMutateAsync.mockResolvedValue({ game: null });

    const searchQuery = ref("기존검색어");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(toast.warning).toHaveBeenCalledWith("랜덤 선택할 게임이 없습니다.");
    // 검색어는 변경되지 않아야 함
    expect(searchQuery.value).toBe("기존검색어");
  });

  it("mutation 에러 시 error 토스트를 표시한다", async () => {
    mockMutateAsync.mockRejectedValue(new Error("DB 오류"));

    const searchQuery = ref("");
    const options = createOptions({ searchQuery });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(toast.error).toHaveBeenCalledWith("랜덤 선택에 실패했습니다.");
    // 검색어는 변경되지 않아야 함
    expect(searchQuery.value).toBe("");
  });

  it("mutation 호출 시 sourcePaths와 searchQuery를 올바르게 전달한다", async () => {
    mockMutateAsync.mockResolvedValue({
      game: {
        path: "/game/1",
        title: "게임",
        originalTitle: "ゲーム",
        translatedTitle: null,
      },
    });

    const searchQuery = ref("");
    const filters = computed(() => ({ status: "playing" })) as any;
    const sortBy = computed(() => "rating") as any;
    const sortOrder = computed(() => "desc") as any;
    const options = createOptions({ searchQuery, filters, sortBy, sortOrder });
    const { handleRandomSelect } = useRandomSelect(options);

    await handleRandomSelect();

    expect(mockMutateAsync).toHaveBeenCalledWith({
      sourcePaths: ["/library/path1", "/library/path2"],
      searchQuery: {
        query: undefined,
        filters: { status: "playing" },
        sortBy: "rating",
        sortOrder: "desc",
      },
    });
  });
});
