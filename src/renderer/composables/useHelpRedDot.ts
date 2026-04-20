/**
 * 도움말 레드닷 Composable
 * 카드 단위로 조회 이력을 관리하고 읽지 않은 카드를 추적
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ALL_CARD_IDS } from "../lib/helpCardRegistry";
import { queryKeys } from "../queryKeys";

/**
 * 본 도움말 카드 목록 조회
 */
export function useViewedHelpCards() {
  return useQuery({
    queryKey: queryKeys.helpRedDot.all,
    queryFn: async () => {
      const result = (await window.api.invoke("getViewedHelpCards")) as {
        cardIds: string[];
      };
      return result.cardIds;
    },
  });
}

/**
 * 도움말 카드 일괄 읽음 표시 (페이지 이탈 시 호출)
 */
export function useMarkHelpCardsViewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cardIds: string[]) => {
      return await window.api.invoke("markHelpCardsViewed", { cardIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.helpRedDot.all });
    },
  });
}

/**
 * 특정 카드가 NEW인지 확인하는 함수 반환
 * vue-query 캐시를 공유하므로 여러 컴포넌트에서 호출해도 추가 요청 없음
 */
export function useIsNewCard() {
  const { data: viewedHelpCards } = useViewedHelpCards();
  return (cardId: string): boolean => {
    const viewed = viewedHelpCards.value || [];
    return !viewed.includes(cardId);
  };
}

/**
 * 미열람 카드가 하나라도 있는지 확인
 */
export function useHasUnviewedCards() {
  const { data: viewedHelpCards } = useViewedHelpCards();
  const viewed = viewedHelpCards.value || [];
  return viewed.length < ALL_CARD_IDS.length;
}
