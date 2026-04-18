import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

import "@kfonts/d2coding";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "vue-sonner/style.css";
import "./style.css";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia).use(router).use(VueQueryPlugin).mount("#app");
