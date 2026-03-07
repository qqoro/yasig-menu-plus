/**
 * 체인지로그 서비스
 *
 * GitHub Releases API를 통해 릴리즈 내역 조회
 */

const GITHUB_REPO = "qqoro/yasig-menu-plus";
const API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

export interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  html_url: string;
}

export class ChangelogService {
  private static instance: ChangelogService;

  private constructor() {}

  static getInstance(): ChangelogService {
    if (!ChangelogService.instance) {
      ChangelogService.instance = new ChangelogService();
    }
    return ChangelogService.instance;
  }

  /**
   * 현재 버전 이후의 릴리즈 목록 조회 (업데이트 알림용)
   */
  async getReleasesAfterVersion(
    currentVersion: string,
  ): Promise<ReleaseInfo[]> {
    try {
      const response = await fetch(API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "yasig-menu-plus",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const releases: GitHubRelease[] = await response.json();

      // 현재 버전 정규화 (v1.2.3 -> 1.2.3)
      const normalizedCurrent = currentVersion.replace(/^v/, "");

      // 현재 버전 이후 릴리즈만 필터링
      const filteredReleases = this.filterReleasesAfterVersion(
        releases,
        normalizedCurrent,
      );

      return filteredReleases.map((release) => ({
        version: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || "",
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
      }));
    } catch (error) {
      console.error("체인지로그 조회 실패:", error);
      return [];
    }
  }

  /**
   * 최근 N개 릴리즈 조회 (업데이트 후 첫 실행용)
   */
  async getRecentReleases(limit: number = 10): Promise<ReleaseInfo[]> {
    try {
      const response = await fetch(API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "yasig-menu-plus",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const releases: GitHubRelease[] = await response.json();

      return releases.slice(0, limit).map((release) => ({
        version: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || "",
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
      }));
    } catch (error) {
      console.error("체인지로그 조회 실패:", error);
      return [];
    }
  }

  /**
   * 현재 버전 이후 릴리즈 필터링
   */
  private filterReleasesAfterVersion(
    releases: GitHubRelease[],
    currentVersion: string,
  ): GitHubRelease[] {
    const result: GitHubRelease[] = [];

    for (const release of releases) {
      const releaseVersion = release.tag_name.replace(/^v/, "");

      // 현재 버전보다 높은 버전만 포함
      if (this.compareVersions(releaseVersion, currentVersion) > 0) {
        result.push(release);
      }
    }

    return result;
  }

  /**
   * 버전 비교 (a > b: 1, a == b: 0, a < b: -1)
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;

      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }

    return 0;
  }
}

export const changelogService = ChangelogService.getInstance();
