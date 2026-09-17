import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/**
 * useSearch composable 테스트
 * 실행: pnpm test -- src/renderer/composables/__tests__/useSearch.test.ts
 */

// ========== 모킹 ==========

// vitest 설정에는 renderer의 @ 별칭이 없으므로 실제 모듈로 연결한다
vi.mock("@/lib/search-prefix", () => import("../../lib/search-prefix"));

// Vue Query는 앱 컨텍스트 없이 쓸 수 없으므로, 넘겨받은 옵션만 잡아 두고 queryFn을 직접 호출한다
const captured = vi.hoisted(() => ({
  infiniteQueryFn: undefined as
    ((ctx: { pageParam: number }) => Promise<unknown>) | undefined,
  queryFn: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: (options: { queryFn: typeof captured.infiniteQueryFn }) => {
    captured.infiniteQueryFn = options.queryFn;
    return {
      data: ref(undefined),
      isLoading: ref(false),
      error: ref(null),
      fetchNextPage: vi.fn(),
      hasNextPage: ref(false),
      isFetchingNextPage: ref(false),
    };
  },
  useQuery: (options: { queryFn: typeof captured.queryFn }) => {
    captured.queryFn = options.queryFn;
    return { data: ref(undefined) };
  },
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));

// IPC 전송은 인자를 structured clone으로 직렬화하므로 같은 방식으로 흉내 낸다
const mockInvoke = vi.fn(async (_channel: string, args: unknown) => {
  structuredClone(args);
  return { games: [], totalCount: 0, hasMore: false };
});
vi.stubGlobal("window", { api: { invoke: mockInvoke } });

// 모킹 후 import
import { useSearch } from "../useSearch";

describe("useSearch", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  describe("필터 패널에서 필터를 바꾼 뒤의 IPC 요청", () => {
    /** HomeView.updateFilters와 같은 방식으로 필터를 갱신한 검색 상태 */
    function createSearchAfterFilterToggle() {
      const search = useSearch(() => ["G:/Games"]);
      // reactive 필터를 spread하면 providers 배열이 proxy인 채로 새 객체에 담긴다
      search.filters.value = { ...search.filters.value, showFavorites: true };
      return search;
    }

    it("게임 목록 조회가 직렬화 오류 없이 전송된다", async () => {
      createSearchAfterFilterToggle();

      await expect(
        captured.infiniteQueryFn!({ pageParam: 0 }),
      ).resolves.toBeDefined();
      expect(mockInvoke).toHaveBeenCalledWith(
        "searchGames",
        expect.objectContaining({
          searchQuery: expect.objectContaining({
            filters: expect.objectContaining({
              showFavorites: true,
              providers: [],
            }),
          }),
        }),
      );
    });

    it("랜덤 버튼용 개수 조회가 직렬화 오류 없이 전송된다", async () => {
      createSearchAfterFilterToggle();

      await expect(captured.queryFn!()).resolves.toBe(0);
    });
  });
});
