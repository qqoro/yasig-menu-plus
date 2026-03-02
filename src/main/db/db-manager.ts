import { app } from "electron";
import log from "electron-log";
import { existsSync } from "fs";
import type { Knex } from "knex";
import knex from "knex";
import { resolve } from "path";

export class DBManager {
  private readonly db: Knex;
  private readonly isDevelopment: boolean;

  constructor() {
    this.isDevelopment = !app.isPackaged;
    this.db = this.createKnexInstance();
  }

  private createKnexInstance(): Knex {
    // 마이그레이션 디렉토리 경로 결정
    let migrationsDirectory: string;

    if (this.isDevelopment) {
      migrationsDirectory = resolve(import.meta.dirname, "./migrations");
    } else {
      // 프로덕션에서는 여러 경로를 시도
      const possiblePaths = [
        resolve(process.resourcesPath, "migrations"),
        resolve(import.meta.dirname, "migrations"),
        resolve(app.getAppPath(), "main", "migrations"),
      ];

      migrationsDirectory =
        possiblePaths.find((path) => existsSync(path)) || possiblePaths[0];
      log.info(`마이그레이션 디렉토리: ${migrationsDirectory}`);
      log.info(`디렉토리 존재 여부: ${existsSync(migrationsDirectory)}`);
    }

    // snake_case를 camelCase로 변환하는 함수
    const toCamelCase = (obj: any): any => {
      if (obj === null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(toCamelCase);
      const result: any = {};
      for (const key in obj) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        );
        result[camelKey] = toCamelCase(obj[key]);
      }
      return result;
    };

    // camelCase를 snake_case로 변환하는 함수
    const toSnakeCase = (str: string): string => {
      if (!str) return str;
      return str
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");
    };

    const config: Knex.Config = {
      client: "better-sqlite3",
      connection: this.isDevelopment
        ? { filename: "./dev.sqlite3" }
        : { filename: resolve(app.getPath("userData"), "database.db") },
      useNullAsDefault: true,
      postProcessResponse: (result) => toCamelCase(result),
      wrapIdentifier: (value, origImpl) => {
        if (value === "*") return origImpl(value);
        return origImpl(toSnakeCase(value));
      },
      migrations: {
        tableName: "knex_migrations",
        extension: "js",
        directory: migrationsDirectory,
        loadExtensions: [".js"],
      },
    };

    log.info("Knex 설정:", JSON.stringify(config, null, 2));
    return knex(config);
  }

  /**
   * 데이터베이스 초기화 및 마이그레이션 실행
   */
  async initialize(): Promise<any> {
    try {
      log.info("데이터베이스 초기화 시작...");
      log.info(`환경: ${this.isDevelopment ? "개발" : "프로덕션"}`);
      log.info(`앱 경로: ${app.getAppPath()}`);
      log.info(`사용자 데이터 경로: ${app.getPath("userData")}`);
      log.info(`리소스 경로: ${process.resourcesPath}`);
      log.info("DB 파일 경로:", this.db.client.config.connection.filename);

      // SQLite 외래키 활성화
      await this.db.raw(`PRAGMA foreign_keys = ON`);

      // 마이그레이션 실행
      const list = await this.runMigrations();

      log.info("데이터베이스 초기화 완료");
      return list;
    } catch (error) {
      log.error("데이터베이스 초기화 실패:", error);
    }
  }

  /**
   * 모든 마이그레이션 실행
   */
  async runMigrations(): Promise<any> {
    try {
      log.info("마이그레이션 실행 중...");
      const [batchNo, migrationFiles] = await this.db.migrate.latest();

      if (migrationFiles.length === 0) {
        log.info("실행할 마이그레이션이 없습니다.");
      } else {
        log.info(
          `배치 ${batchNo}에서 ${migrationFiles.length}개의 마이그레이션을 실행했습니다:`,
          migrationFiles,
        );
      }
      return migrationFiles;
    } catch (error) {
      log.error("마이그레이션 실행 실패:", error);
      throw error;
    }
  }

  /**
   * 마이그레이션 롤백
   */
  async rollback(): Promise<void> {
    try {
      log.info("마이그레이션 롤백 중...");
      const [batchNo, migrationFiles] = await this.db.migrate.rollback();

      if (migrationFiles.length === 0) {
        log.info("롤백할 마이그레이션이 없습니다.");
      } else {
        log.info(
          `배치 ${batchNo}에서 ${migrationFiles.length}개의 마이그레이션을 롤백했습니다:`,
          migrationFiles,
        );
      }
    } catch (error) {
      log.error("마이그레이션 롤백 실패:", error);
      throw error;
    }
  }

  /**
   * 데이터베이스 연결 해제
   */
  async destroy(): Promise<void> {
    try {
      await this.db.destroy();
      log.info("데이터베이스 연결 해제 완료");
    } catch (error) {
      log.error("데이터베이스 연결 해제 실패:", error);
      throw error;
    }
  }

  /**
   * Knex 인스턴스 반환
   */
  getKnex(): Knex {
    return this.db;
  }
}

// 싱글톤 인스턴스
export const dbManager = new DBManager();
export const db = dbManager.getKnex();
