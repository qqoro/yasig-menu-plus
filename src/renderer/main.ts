import { QueryCache, MutationCache, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { createLogger, initRendererErrorLogging } from "./lib/logger";
import router from "./router";

import "@kfonts/d2coding";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "vue-sonner/style.css";
import "./style.css";

const queryLog = createLogger("query");

const pinia = createPinia();
const app = createApp(App);

initRendererErrorLogging(app);

app
  .use(pinia)
  .use(router)
  .use(VueQueryPlugin, {
    queryClientConfig: {
      // IPC 호출 실패는 화면에 토스트로만 뜨고 사라져 원인 추적이 안 된다.
      // 쿼리 키/변수와 함께 로그에 남겨 제보만으로 재구성할 수 있게 한다.
      queryCache: new QueryCache({
        onError: (error, query) => {
          queryLog.error(
            `쿼리 실패 [${JSON.stringify(query.queryKey)}]:`,
            error,
          );
        },
      }),
      mutationCache: new MutationCache({
        onError: (error, variables, _context, mutation) => {
          queryLog.error(
            `뮤테이션 실패 [${mutation.options.mutationKey ? JSON.stringify(mutation.options.mutationKey) : "이름 없음"}]:`,
            error,
            variables,
          );
        },
      }),
    },
  })
  .mount("#app");
