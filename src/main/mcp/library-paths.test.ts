import { describe, expect, it, vi } from "vitest";

const storeState = {
  libraryPaths: ["C:\\a", "C:\\b", "C:\\c"],
  disabled: ["C:\\b"],
};

vi.mock("../store.js", () => ({
  getLibraryPaths: () => storeState.libraryPaths,
  getDisabledLibraryPaths: () => storeState.disabled,
}));

import { getActiveLibraryPaths } from "./library-paths.js";

describe("getActiveLibraryPaths", () => {
  it("비활성 경로를 제외해야 한다", () => {
    expect(getActiveLibraryPaths()).toEqual(["C:\\a", "C:\\c"]);
  });

  it("비활성 목록이 비어 있으면 전체를 돌려줘야 한다", () => {
    storeState.disabled = [];
    expect(getActiveLibraryPaths()).toEqual(["C:\\a", "C:\\b", "C:\\c"]);
  });
});
