import { ref } from "vue";
import { toast } from "vue-sonner";
import { useAddExcludedExecutable } from "./useExcludedExecutables";
import { useOpenOriginalSite } from "./useGameDetail";
import { useGameImages } from "./useGameImages";
import { useOpenFolder, usePlayGame } from "./useGames";
import { useDeleteGames } from "./useDuplicates";
import type { GameItem } from "../types";
import type { SearchState } from "./useSearch";

interface UseHomeActionsOptions {
  searchState: SearchState;
}

export function useHomeActions({ searchState }: UseHomeActionsOptions) {
  const addExcludedExecutable = useAddExcludedExecutable();
  const playGameMutation = usePlayGame();
  const openFolderMutation = useOpenFolder();
  const openOriginalSite = useOpenOriginalSite();
  const deleteGamesMutation = useDeleteGames();

  // 게임 상세 다이얼로그 상태
  const showGameDetail = ref(false);
  const selectedGamePath = ref<string | null>(null);

  // 이미지 캐러셀 상태
  const carouselOpen = ref(false);
  const carouselGamePath = ref<string>("");
  const { data: gameImages } = useGameImages(carouselGamePath);

  // 게임 삭제 상태
  const deleteTargetGame = ref<GameItem | null>(null);
  const showDeleteConfirm = ref(false);

  /**
   * 게임 실행 핸들러
   */
  async function handlePlayGame(game: GameItem): Promise<void> {
    try {
      const executablePath = await playGameMutation.mutateAsync(game.path);
      const fileName = executablePath.split(/[/\\]/).pop() || executablePath;

      toast.success(`${game.title} 실행했습니다.`, {
        description: fileName,
        action: {
          label: "제외 목록에 추가",
          onClick: async () => {
            try {
              await addExcludedExecutable.mutateAsync(fileName);
              toast.success(
                `"${fileName}"이(가) 실행 제외 목록에 추가되었습니다.`,
              );
            } catch {
              toast.error("실행 제외 목록 추가에 실패했습니다.");
            }
          },
        },
      });
    } catch (err) {
      console.error("게임 실행 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "게임 실행에 실패했습니다.",
      );
    }
  }

  /**
   * 폴더 열기 핸들러
   */
  async function handleOpenFolder(game: GameItem): Promise<void> {
    try {
      await openFolderMutation.mutateAsync(game.path);
      toast.success("폴더를 열었습니다.");
    } catch (err) {
      console.error("폴더 열기 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "폴더 열기에 실패했습니다.",
      );
    }
  }

  /**
   * 즐겨찾기 토글 핸들러
   */
  async function handleToggleFavorite(game: GameItem): Promise<void> {
    try {
      const result = await searchState.toggleFavorite(game.path);
      toast.success(
        result.value
          ? "즐겨찾기에 추가했습니다."
          : "즐겨찾기에서 제거했습니다.",
      );
    } catch (err) {
      console.error("즐겨찾기 토글 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "즐겨찾기 토글에 실패했습니다.",
      );
    }
  }

  /**
   * 숨김 토글 핸들러
   */
  async function handleToggleHidden(game: GameItem): Promise<void> {
    try {
      const result = await searchState.toggleHidden(game.path);
      toast.success(
        result.value ? "게임을 숨겼습니다." : "숨김을 해제했습니다.",
      );
    } catch (err) {
      console.error("숨김 토글 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "숨김 토글에 실패했습니다.",
      );
    }
  }

  /**
   * 클리어 토글 핸들러
   */
  async function handleToggleClear(game: GameItem): Promise<void> {
    try {
      const result = await searchState.toggleClear(game.path);
      toast.success(
        result.value ? "클리어로 표시했습니다." : "클리어를 취소했습니다.",
      );
    } catch (err) {
      console.error("클리어 토글 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "클리어 토글에 실패했습니다.",
      );
    }
  }

  /**
   * 게임 삭제 요청 핸들러 (확인 다이얼로그 표시)
   */
  function handleDeleteRequest(game: GameItem): void {
    deleteTargetGame.value = game;
    showDeleteConfirm.value = true;
  }

  /**
   * 게임 삭제 확정 핸들러
   */
  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTargetGame.value) return;
    const path = deleteTargetGame.value.path;
    deleteTargetGame.value = null;

    try {
      await deleteGamesMutation.mutateAsync([path]);
    } catch (err) {
      console.error("게임 삭제 실패:", err);
    }
  }

  /**
   * 원본 사이트 열기 핸들러
   */
  async function handleOpenOriginalSite(game: GameItem): Promise<void> {
    try {
      await openOriginalSite.mutateAsync(game.path);
    } catch (err) {
      console.error("원본 사이트 열기 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "원본 사이트 열기에 실패했습니다.",
      );
    }
  }

  /**
   * 게임 상세 보기 핸들러
   */
  function handleShowDetail(game: GameItem): void {
    selectedGamePath.value = game.path;
    showGameDetail.value = true;
  }

  /**
   * 게임 더블클릭 핸들러 (이미지 캐러셀)
   */
  function handleGameDoubleClick(game: GameItem): void {
    carouselGamePath.value = game.path;
    carouselOpen.value = true;
  }

  return {
    // 상태
    showGameDetail,
    selectedGamePath,
    carouselOpen,
    carouselGamePath,
    gameImages,
    deleteTargetGame,
    showDeleteConfirm,
    // 핸들러
    handlePlayGame,
    handleOpenFolder,
    handleToggleFavorite,
    handleToggleHidden,
    handleToggleClear,
    handleDeleteRequest,
    handleDeleteConfirm,
    handleOpenOriginalSite,
    handleShowDetail,
    handleGameDoubleClick,
  };
}
