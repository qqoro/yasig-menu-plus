import { describe, expect, it } from "vitest";
import {
  extractCienId,
  extractDlsiteId,
  extractExternalId,
  extractExternalIdFromPath,
  extractGetchuId,
  extractSteamId,
  extractVndbId,
  hasExternalId,
} from "./external-id.js";

describe("extractDlsiteId", () => {
  it.each([
    ["RJ01234567 샘플 게임", "RJ01234567", "기본"],
    ["[RJ01234567] 샘플 게임", "RJ01234567", "대괄호"],
    ["rj123456", "rj123456", "소문자는 원문 유지"],
    ["BJ123456", "BJ123456", "BJ"],
    ["VJ123456", "VJ123456", "VJ"],
    ["RJ-01234567", "RJ01234567", "하이픈 구분자"],
    ["RJ_01234567", "RJ01234567", "언더스코어 구분자"],
    ["[RJ]01234567", "RJ01234567", "대괄호 구분자"],
    ["RJ(01234567)", "RJ01234567", "소괄호 구분자"],
    ["샘플_RJ01234567", "RJ01234567", "언더스코어 뒤"],
    ["購入RJ01234567", "RJ01234567", "일본어 뒤"],
    ["product_id/RJ01234567.html", "RJ01234567", "작품 URL"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(extractDlsiteId(input)).toBe(expected);
  });

  it.each([
    ["XRJ01234567", "앞에 영문"],
    ["2RJ01234567", "앞에 숫자"],
    ["RJ 01234567", "공백은 구분자 아님"],
    ["RJ.01234567", "마침표는 구분자 아님"],
    ["RJ12345", "5자리"],
    ["RJ123456789", "9자리"],
    ["RJ01234567abc", "뒤에 영문"],
  ])("%s → 인식 안 함 (%s)", (input) => {
    expect(extractDlsiteId(input)).toBeUndefined();
  });
});

describe("extractSteamId", () => {
  it.each([
    ["ST1234560 샘플", "1234560", "ST"],
    ["st1234560", "1234560", "소문자 st"],
    ["steam1234560", "1234560", "steam"],
    ["STEAM-1234560", "1234560", "STEAM + 하이픈"],
    ["steam_1234560", "1234560", "steam + 언더스코어"],
    ["[ST]1234560", "1234560", "대괄호 구분자"],
    ["ST(1234560)", "1234560", "소괄호 구분자"],
    [
      "https://store.steampowered.com/app/1234560/Sample_Game/",
      "1234560",
      "상점 URL",
    ],
    [
      "https://store.steampowered.com/app/570/",
      "570",
      "상점 URL은 자릿수 제한 없음",
    ],
  ])("%s → %s (%s)", (input, expected) => {
    expect(extractSteamId(input)).toBe(expected);
  });

  it.each([
    ["steam 1234560", "공백 구분"],
    ["steam sample 12345", "steam 뒤 다른 단어"],
    ["Latest12345", "단어 안의 st"],
    ["Test2024", "단어 안의 st 2"],
    ["SteamLibrary", "숫자 없음"],
    ["ST123", "3자리"],
    ["ST123456789", "9자리"],
  ])("%s → 인식 안 함 (%s)", (input) => {
    expect(extractSteamId(input)).toBeUndefined();
  });
});

describe("extractGetchuId", () => {
  it.each([
    ["GC123456 샘플", "123456", "GC"],
    ["GETCHU-123456", "123456", "GETCHU + 하이픈"],
    ["[GC]123456", "123456", "대괄호 구분자"],
    ["샘플_GC123456", "123456", "언더스코어 뒤"],
    [
      "https://www.getchu.com/soft.phtml?id=1234567",
      "1234567",
      "soft.phtml URL",
    ],
    ["https://www.getchu.com/item/1234567/", "1234567", "item URL"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(extractGetchuId(input)).toBe(expected);
  });

  it.each([
    ["XGC123456", "앞에 영문"],
    ["GC12345678", "8자리"],
    ["GC 123456", "공백 구분"],
  ])("%s → 인식 안 함 (%s)", (input) => {
    expect(extractGetchuId(input)).toBeUndefined();
  });
});

describe("extractCienId", () => {
  it.each([
    ["CE123-456 샘플", "123-456", "CE"],
    ["CIEN-123-456", "123-456", "CIEN + 하이픈"],
    ["CI-EN_123-456", "123-456", "CI-EN + 언더스코어"],
    ["CE123article456", "123-456", "article 형식"],
    ["CIENCREATOR123ARTICLE456", "123-456", "대문자 creator/article"],
    ["https://ci-en.net/creator/123/article/456", "123-456", "ci-en.net URL"],
    [
      "https://ci-en.dlsite.com/creator/123/article/456",
      "123-456",
      "ci-en.dlsite.com URL",
    ],
  ])("%s → %s (%s)", (input, expected) => {
    expect(extractCienId(input)).toBe(expected);
  });

  it.each([
    ["PRICE123-456", "단어 안의 ce"],
    ["CE-123", "글 번호 없음"],
    ["CE 123-456", "공백 구분"],
  ])("%s → 인식 안 함 (%s)", (input) => {
    expect(extractCienId(input)).toBeUndefined();
  });
});

describe("extractVndbId", () => {
  it.each([
    ["v562 Sample Title", "562", "v"],
    ["vn4 Sample Title", "4", "vn"],
    ["https://vndb.org/v7", "7", "URL은 1자리도 인식"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(extractVndbId(input)).toBe(expected);
  });

  it.each([
    ["Sample v-2024", "구분자 허용 안 함"],
    ["Sample (v)1234", "괄호 구분자 허용 안 함"],
    ["Sample v1.02", "버전 표기"],
    ["C:\\Games\\v12\\Sample", "상위 폴더의 코드"],
  ])("%s → 인식 안 함 (%s)", (input) => {
    expect(extractVndbId(input)).toBeUndefined();
  });
});

describe("extractExternalId", () => {
  it("여러 코드가 있으면 제공자 우선순위(DLsite → Steam → Getchu → Ci-en → VNDB)를 따름", () => {
    expect(extractExternalId("ST1234560 RJ01234567")).toEqual({
      provider: "dlsite",
      id: "RJ01234567",
    });
    expect(extractExternalId("v562 GC123456")).toEqual({
      provider: "getchu",
      id: "123456",
    });
  });

  it("코드가 없으면 undefined", () => {
    expect(extractExternalId("샘플 게임")).toBeUndefined();
  });
});

describe("hasExternalId", () => {
  it.each([
    ["RJ01234567 샘플 음성", true],
    ["steam_1234560", true],
    ["GC123456", true],
    ["CE123-456", true],
    ["vn4 샘플", true],
    ["샘플 음성", false],
    ["Test2024", false],
  ])("%s → %s", (input, expected) => {
    expect(hasExternalId(input)).toBe(expected);
  });
});

describe("extractExternalIdFromPath", () => {
  it("게임 폴더에 코드가 없으면 상위 폴더의 코드를 씀", () => {
    expect(
      extractExternalIdFromPath("D:\\Games\\RJ01234567 샘플\\SampleGame"),
    ).toEqual({ provider: "dlsite", id: "RJ01234567" });
  });

  it("여러 단계에 코드가 있으면 게임에 가까운 쪽을 우선", () => {
    expect(
      extractExternalIdFromPath("D:/RJ00000001 묶음/RJ01234567 샘플"),
    ).toEqual({ provider: "dlsite", id: "RJ01234567" });
  });

  it("가까운 폴더의 하위 우선순위 코드가 먼 폴더의 상위 우선순위 코드보다 앞섬", () => {
    expect(
      extractExternalIdFromPath("D:\\RJ01234567 묶음\\GC123456 샘플"),
    ).toEqual({ provider: "getchu", id: "123456" });
  });

  it("VNDB는 다른 코드가 어디에도 없을 때만 게임 폴더명에서 찾음", () => {
    expect(
      extractExternalIdFromPath("D:\\RJ01234567 샘플\\Sample v12"),
    ).toEqual({ provider: "dlsite", id: "RJ01234567" });
    expect(extractExternalIdFromPath("D:\\Games\\v562 Sample")).toEqual({
      provider: "vndb",
      id: "562",
    });
    expect(extractExternalIdFromPath("D:\\v562\\Sample")).toBeUndefined();
  });

  it("경로 중간의 단어 속 접두어는 무시 (SteamLibrary, Test2024)", () => {
    expect(
      extractExternalIdFromPath(
        "D:\\SteamLibrary\\Games2024\\Test2024\\Sample",
      ),
    ).toBeUndefined();
  });
});
