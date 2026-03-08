import { createHash } from "crypto";
import { app } from "electron";
import {
  access,
  constants,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "fs/promises";
import type { IncomingMessage } from "http";
import * as http from "http";
import * as https from "https";
import { join } from "path";
import sharp from "sharp";
import { validateUrl } from "./validator.js";

/**
 * 썸네일 저장 디렉토리 경로
 */
export function getThumbnailDir(): string {
  return join(app.getPath("userData"), "thumbnails");
}

/**
 * 썸네일 파일명 생성 (게임 경로 기반 해시)
 */
export function generateThumbnailFilename(
  gamePath: string,
  index: number = 0,
): string {
  const hash = createHash("md5").update(gamePath).digest("hex");
  // 인덱스가 0이면 (썸네일) 접미사 없음, 1 이상이면 _1, _2 ... 추가
  const suffix = index === 0 ? "" : `_${index}`;
  return `${hash}${suffix}.jpg`;
}

/**
 * 이미지 최적화 설정
 */
const IMAGE_CONFIG = {
  maxWidth: 1280,
  quality: 80,
} as const;

/**
 * 이미지 최적화 (리사이징 + WebP 변환)
 * @param buffer 원본 이미지 버퍼
 * @returns 최적화된 WebP 버퍼
 */
export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(IMAGE_CONFIG.maxWidth, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_CONFIG.quality })
    .toBuffer();
}

/**
 * URL에서 이미지 다운로드 후 WebP로 변환
 * @param url 이미지 URL
 * @param gamePath 게임 경로
 * @param index 이미지 인덱스 (0 = 썸네일, 1+ = 추가 이미지)
 */
export async function downloadImage(
  url: string,
  gamePath: string,
  index: number = 0,
): Promise<string> {
  const thumbnailDir = getThumbnailDir();
  await mkdir(thumbnailDir, { recursive: true });

  // WebP 확장자로 저장
  const filename = generateThumbnailFilename(gamePath, index);
  const webpFilename = filename.replace(/\.[^.]+$/, ".webp");
  const filePath = join(thumbnailDir, webpFilename);

  // base64 data URL 처리
  if (url.startsWith("data:")) {
    const matches = url.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error("잘못된 data URL 형식");
    }
    const buffer = Buffer.from(matches[2], "base64");
    const optimized = await optimizeImage(buffer);
    await writeFile(filePath, optimized);
    return filePath;
  }

  // URL 검증
  validateUrl(url);

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    // URL에서 origin 추출하여 Referer 헤더로 설정 (Getchu 등 hotlinking 방지 사이트 대응)
    const urlObj = new URL(url);
    const referer = `${urlObj.protocol}//${urlObj.host}/`;

    const request = client.get(
      url,
      { headers: { Referer: referer } },
      (response: IncomingMessage) => {
        if (response.statusCode !== 200) {
          reject(new Error(`다운로드 실패: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const optimized = await optimizeImage(buffer);
            await writeFile(filePath, optimized);
            resolve(filePath);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error("다운로드 타임아웃"));
    });
  });
}

/**
 * 이미지 파일 삭제
 */
export async function deleteImage(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // 파일이 없으면 무시
  }
}

/**
 * 썸네일 파일 삭제 (이미지 삭제와 동일)
 */
export async function deleteThumbnail(filePath: string): Promise<void> {
  return deleteImage(filePath);
}

/**
 * 파일 복사 후 WebP로 변환
 * @param sourcePath 원본 파일 경로
 * @param gamePath 게임 경로 (파일명 생성용)
 * @param index 이미지 인덱스 (0 = 썸네일, 1+ = 추가 이미지)
 */
export async function copyImage(
  sourcePath: string,
  gamePath: string,
  index: number = 0,
): Promise<string> {
  const thumbnailDir = getThumbnailDir();
  await mkdir(thumbnailDir, { recursive: true });

  // 원본 파일 존재 확인
  try {
    await access(sourcePath, constants.R_OK);
  } catch {
    throw new Error(`원본 파일을 읽을 수 없습니다: ${sourcePath}`);
  }

  // WebP 확장자로 저장
  const hash = createHash("md5").update(gamePath).digest("hex");
  const suffix = index === 0 ? "" : `_${index}`;
  const filename = `${hash}${suffix}.webp`;
  const destPath = join(thumbnailDir, filename);

  // 파일 읽기 → 최적화 → 저장
  const buffer = await readFile(sourcePath);
  const optimized = await optimizeImage(buffer);
  await writeFile(destPath, optimized);

  return destPath;
}
