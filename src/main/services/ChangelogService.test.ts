import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChangelogService } from "./ChangelogService.js";
import type { ReleaseInfo } from "./ChangelogService.js";

// GitHub API 릴리즈 응답 헬퍼 함수
function makeRelease(
  tagName: string,
  options?: {
    name?: string | null;
    body?: string | null;
    prerelease?: boolean;
  },
) {
  return {
    tag_name: tagName,
    name: options?.name !== undefined ? options.name : `Release ${tagName}`,
    body: options?.body !== undefined ? options.body : `Changes in ${tagName}`,
    published_at: "2025-01-01T00:00:00Z",
    html_url: `https://github.com/qqoro/yasig-menu-plus/releases/tag/${tagName}`,
    prerelease: options?.prerelease ?? false,
  };
}

// fetch 모킹 응답 생성 헬퍼
function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error("Network error"));
}

describe("ChangelogService", () => {
  const service = ChangelogService.getInstance();

  beforeEach(() => {
    // 각 테스트 전에 console.error 모킹 (에러 출력 억제)
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getInstance", () => {
    it("싱글톤 인스턴스를 반환한다", () => {
      const instance1 = ChangelogService.getInstance();
      const instance2 = ChangelogService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("getReleasesAfterVersion", () => {
    it("현재 버전보다 높은 릴리즈만 필터링한다", async () => {
      const releases = [
        makeRelease("v1.2.0"),
        makeRelease("v1.1.0"),
        makeRelease("v1.0.0"),
        makeRelease("v0.9.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe("v1.2.0");
      expect(result[1].version).toBe("v1.1.0");
    });

    it("currentVersion에 v 접두사가 있어도 정상 처리한다", async () => {
      const releases = [
        makeRelease("v1.2.0"),
        makeRelease("v1.0.0"),
        makeRelease("v0.9.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("v1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.2.0");
    });

    it("name이 null이면 tag_name을 사용한다", async () => {
      const releases = [makeRelease("v2.0.0", { name: null })];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("v2.0.0");
    });

    it("body가 null이면 빈 문자열을 사용한다", async () => {
      const releases = [makeRelease("v2.0.0", { body: null })];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].body).toBe("");
    });

    it("fetch 실패 시 빈 배열을 반환한다", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError());

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it("response.ok가 false이면 빈 배열을 반환한다", async () => {
      vi.stubGlobal("fetch", mockFetchError(403));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it("ReleaseInfo 형태로 올바르게 매핑한다", async () => {
      const releases = [
        {
          tag_name: "v2.0.0",
          name: "Version 2.0.0",
          body: "# 변경사항\n- 기능 추가",
          published_at: "2025-06-15T12:00:00Z",
          html_url:
            "https://github.com/qqoro/yasig-menu-plus/releases/tag/v2.0.0",
          prerelease: false,
        },
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      const release: ReleaseInfo = result[0];
      expect(release.version).toBe("v2.0.0");
      expect(release.name).toBe("Version 2.0.0");
      expect(release.body).toBe("# 변경사항\n- 기능 추가");
      expect(release.publishedAt).toBe("2025-06-15T12:00:00Z");
      expect(release.htmlUrl).toBe(
        "https://github.com/qqoro/yasig-menu-plus/releases/tag/v2.0.0",
      );
    });

    it("현재 버전과 동일한 릴리즈는 제외한다", async () => {
      const releases = [makeRelease("v1.0.0"), makeRelease("v0.9.0")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(0);
    });

    it("pre-release는 기본적으로 제외한다", async () => {
      const releases = [
        makeRelease("v1.3.0", { prerelease: true }),
        makeRelease("v1.2.0"),
        makeRelease("v1.1.0", { prerelease: true }),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.2.0");
    });

    it("현재 버전이 pre-release면 pre-release도 포함한다", async () => {
      const releases = [
        makeRelease("v1.3.0"),
        makeRelease("v1.2.0", { prerelease: true }),
        makeRelease("v1.1.0", { prerelease: true }),
        makeRelease("v1.0.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      // 현재 버전 v1.1.0이 pre-release이므로 상위 pre-release도 포함
      const result = await service.getReleasesAfterVersion("1.1.0");

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe("v1.3.0");
      expect(result[1].version).toBe("v1.2.0");
    });

    it("현재 버전이 정식 릴리즈면 pre-release는 제외한다", async () => {
      const releases = [
        makeRelease("v1.2.0", { prerelease: true }),
        makeRelease("v1.1.0"),
        makeRelease("v1.0.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.1.0");
    });
  });

  describe("getRecentReleases", () => {
    it("limit만큼만 반환한다", async () => {
      const releases = [
        makeRelease("v1.3.0"),
        makeRelease("v1.2.0"),
        makeRelease("v1.1.0"),
        makeRelease("v1.0.0"),
        makeRelease("v0.9.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases(3);

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe("v1.3.0");
      expect(result[1].version).toBe("v1.2.0");
      expect(result[2].version).toBe("v1.1.0");
    });

    it("기본 limit은 10이다", async () => {
      // 15개 릴리즈 생성
      const releases = Array.from({ length: 15 }, (_, i) =>
        makeRelease(`v1.${14 - i}.0`),
      );
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases();

      expect(result).toHaveLength(10);
    });

    it("릴리즈 수가 limit보다 적으면 전부 반환한다", async () => {
      const releases = [makeRelease("v1.0.0"), makeRelease("v0.9.0")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases(5);

      expect(result).toHaveLength(2);
    });

    it("fetch 실패 시 빈 배열을 반환한다", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError());

      const result = await service.getRecentReleases();

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it("response.ok가 false이면 빈 배열을 반환한다", async () => {
      vi.stubGlobal("fetch", mockFetchError(500));

      const result = await service.getRecentReleases();

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it("name이 null이면 tag_name을, body가 null이면 빈 문자열을 사용한다", async () => {
      const releases = [makeRelease("v1.0.0", { name: null, body: null })];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases();

      expect(result[0].name).toBe("v1.0.0");
      expect(result[0].body).toBe("");
    });

    it("pre-release는 제외하고 정식 릴리즈만 반환한다", async () => {
      const releases = [
        makeRelease("v1.3.0"),
        makeRelease("v1.2.0", { prerelease: true }),
        makeRelease("v1.1.0"),
        makeRelease("v1.0.0", { prerelease: true }),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases(10);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe("v1.3.0");
      expect(result[1].version).toBe("v1.1.0");
    });

    it("currentVersion이 pre-release면 해당 릴리즈도 포함한다", async () => {
      const releases = [
        makeRelease("v1.3.0"),
        makeRelease("v1.2.0", { prerelease: true }),
        makeRelease("v1.1.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases(10, "v1.2.0");

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe("v1.2.0");
      expect(result[0].name).toBe("Release v1.2.0");
    });

    it("currentVersion이 정식 릴리즈면 pre-release는 제외한다", async () => {
      const releases = [
        makeRelease("v1.3.0"),
        makeRelease("v1.2.0", { prerelease: true }),
        makeRelease("v1.1.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getRecentReleases(10, "v1.1.0");

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe("v1.3.0");
      expect(result[1].version).toBe("v1.1.0");
    });
  });

  describe("버전 비교 (getReleasesAfterVersion을 통한 간접 테스트)", () => {
    it("메이저 버전이 높은 릴리즈를 필터링한다 (2.0.0 > 1.0.0)", async () => {
      const releases = [makeRelease("v2.0.0"), makeRelease("v1.0.0")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v2.0.0");
    });

    it("마이너 버전이 높은 릴리즈를 필터링한다 (1.2.0 > 1.1.0)", async () => {
      const releases = [makeRelease("v1.2.0"), makeRelease("v1.1.0")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.1.0");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.2.0");
    });

    it("패치 버전이 높은 릴리즈를 필터링한다 (1.0.2 > 1.0.1)", async () => {
      const releases = [makeRelease("v1.0.2"), makeRelease("v1.0.1")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.1");

      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.0.2");
    });

    it("동일 버전은 제외한다", async () => {
      const releases = [makeRelease("v1.0.0")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(0);
    });

    it("길이가 다른 버전을 올바르게 비교한다 (1.0 vs 1.0.0)", async () => {
      // 1.0 === 1.0.0 이므로 1.0은 필터링되어야 함
      const releases = [makeRelease("v1.0"), makeRelease("v1.1")];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      // v1.0 (= 1.0.0) 은 동일하므로 제외, v1.1 (= 1.1.0) 은 포함
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("v1.1");
    });

    it("현재 버전보다 낮은 릴리즈는 제외한다", async () => {
      const releases = [
        makeRelease("v0.5.0"),
        makeRelease("v0.9.9"),
        makeRelease("v1.0.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.0.0");

      expect(result).toHaveLength(0);
    });

    it("복합 버전 비교가 올바르게 동작한다", async () => {
      const releases = [
        makeRelease("v2.1.0"),
        makeRelease("v2.0.0"),
        makeRelease("v1.5.3"),
        makeRelease("v1.5.2"),
        makeRelease("v1.5.1"),
        makeRelease("v1.4.0"),
      ];
      vi.stubGlobal("fetch", mockFetchSuccess(releases));

      const result = await service.getReleasesAfterVersion("1.5.2");

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.version)).toEqual([
        "v2.1.0",
        "v2.0.0",
        "v1.5.3",
      ]);
    });
  });
});
