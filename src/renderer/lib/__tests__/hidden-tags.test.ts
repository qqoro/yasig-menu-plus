import { describe, expect, it } from "vitest";
import { addHiddenTag, removeHiddenTag, splitTags } from "../hidden-tags";

describe("splitTags", () => {
  const tags = ["순애", "판타지", "반전", "배드엔딩"];

  it("숨김 목록에 정확히 일치하는 태그만 숨긴다", () => {
    expect(splitTags(tags, { hideAll: false, tags: ["반전"] })).toEqual({
      visible: ["순애", "판타지", "배드엔딩"],
      hidden: ["반전"],
    });
  });

  it("부분 일치하는 태그는 숨기지 않는다", () => {
    const result = splitTags(["대반전", "반전주의"], {
      hideAll: false,
      tags: ["반전"],
    });
    expect(result.visible).toEqual(["대반전", "반전주의"]);
    expect(result.hidden).toEqual([]);
  });

  it("전체 숨기기가 켜지면 모든 태그를 숨긴다", () => {
    expect(splitTags(tags, { hideAll: true, tags: [] })).toEqual({
      visible: [],
      hidden: tags,
    });
  });

  it("설정이 없으면 아무것도 숨기지 않는다", () => {
    expect(splitTags(tags, undefined)).toEqual({ visible: tags, hidden: [] });
  });

  it("태그가 없으면 빈 결과를 돌려준다", () => {
    expect(splitTags(undefined, { hideAll: true, tags: ["반전"] })).toEqual({
      visible: [],
      hidden: [],
    });
  });
});

describe("addHiddenTag / removeHiddenTag", () => {
  it("앞뒤 공백을 제거하고 추가한다", () => {
    expect(addHiddenTag(["반전"], "  배드엔딩 ")).toEqual(["반전", "배드엔딩"]);
  });

  it("이미 있는 태그나 빈 문자열은 추가하지 않는다", () => {
    expect(addHiddenTag(["반전"], "반전")).toEqual(["반전"]);
    expect(addHiddenTag(["반전"], "   ")).toEqual(["반전"]);
  });

  it("지정한 태그만 제거한다", () => {
    expect(removeHiddenTag(["반전", "배드엔딩"], "반전")).toEqual(["배드엔딩"]);
  });
});
