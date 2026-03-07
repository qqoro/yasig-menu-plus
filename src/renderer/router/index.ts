import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";
import HomeView from "../views/HomeView.vue";
import SettingsView from "../views/SettingsView.vue";
import DuplicatesView from "../views/DuplicatesView.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView,
  },
  {
    path: "/settings",
    name: "settings",
    component: SettingsView,
  },
  {
    path: "/duplicates",
    name: "duplicates",
    component: DuplicatesView,
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
