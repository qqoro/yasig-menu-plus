import { app } from "electron";
import { createLogger, withConsoleScope } from "../utils/logger.js";
const log = createLogger("DB");
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
      log.debug(
        `마이그레이션 디렉토리: ${migrationsDirectory} (존재: ${existsSync(migrationsDirectory)})`,
      );
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

    return knex(config);
  }

  /**
   * 데이터베이스 초기화 및 마이그레이션 실행
   */
  async initialize(): Promise<any> {
    try {
      log.info(
        `데이터베이스 초기화 시작 (${this.isDevelopment ? "개발" : "프로덕션"})`,
      );
      log.debug(`DB 파일: ${this.db.client.config.connection.filename}`);
      log.debug(
        `앱 경로: ${app.getAppPath()} / 사용자 데이터: ${app.getPath("userData")} / 리소스: ${process.resourcesPath}`,
      );

      // SQLite 외래키 활성화
      await this.db.raw(`PRAGMA foreign_keys = ON`);

      // 마이그레이션 실행
      const list = await this.runMigrations();

      log.info("데이터베이스 초기화 완료");
      return list;
    } catch (error) {
      log.error("데이터베이스 초기화 실패:", error);
      throw error;
    }
  }

  /**
   * 모든 마이그레이션 실행
   */
  async runMigrations(): Promise<any> {
    try {
      log.debug("마이그레이션 확인 중...");

      // 마이그레이션 파일은 asar 바깥(resources/migrations)에 평평하게 배치되어
      // 로거를 import할 수 없다. 실행 구간 동안만 console을 Migration scope로
      // 묶어, 마이그레이션이 남기는 console 출력을 파일 로그로 끌어온다.
      const [batchNo, migrationFiles] = await withConsoleScope(
        "Migration",
        () => this.db.migrate.latest(),
      );

      if (migrationFiles.length === 0) {
        log.debug("실행할 마이그레이션 없음");
      } else {
        log.info(
          `마이그레이션 ${migrationFiles.length}개 실행 (배치 ${batchNo}):`,
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
      const [batchNo, migrationFiles] = await withConsoleScope(
        "Migration",
        () => this.db.migrate.rollback(),
      );

      if (migrationFiles.length === 0) {
        log.info("롤백할 마이그레이션 없음");
      } else {
        log.info(
          `마이그레이션 ${migrationFiles.length}개 롤백 (배치 ${batchNo}):`,
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
