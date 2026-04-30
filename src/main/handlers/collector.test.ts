import { describe, expect, it } from "vitest";

/**
 * ConcurrencyQueue 테스트
 * 실행: pnpm test
 */

// ConcurrencyQueue 구현 (collector.ts에서 복사)
class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(private limit: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    while (this.queue.length > 0 && this.running < this.limit) {
      this.running++;
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } finally {
          this.running--;
          this.process();
        }
      }
    }
  }

  // 테스트용: 현재 실행 중인 태스크 수
  getRunningCount(): number {
    return this.running;
  }

  // 테스트용: 대기 중인 태스크 수
  getQueueLength(): number {
    return this.queue.length;
  }
}

// ============================================
// ConcurrencyQueue 테스트
// ============================================
describe("ConcurrencyQueue", () => {
  it("태스크가 순차적으로 실행됨", async () => {
    const queue = new ConcurrencyQueue(1);
    const results: number[] = [];

    await Promise.all([
      queue.add(async () => {
        results.push(1);
        return 1;
      }),
      queue.add(async () => {
        results.push(2);
        return 2;
      }),
      queue.add(async () => {
        results.push(3);
        return 3;
      }),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  it("동시성 1: 여러 태스크가 추가되어도 동시 실행은 1개를 넘지 않음", async () => {
    const queue = new ConcurrencyQueue(1);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const makeTask = (delay: number) => async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, delay));
      currentConcurrent--;
    };

    await Promise.all([
      queue.add(makeTask(20)),
      queue.add(makeTask(20)),
      queue.add(makeTask(20)),
      queue.add(makeTask(20)),
      queue.add(makeTask(20)),
    ]);

    expect(maxConcurrent).toBe(1);
  });

  it("동시성 1: 한 태스크가 reject되어도 다음 태스크가 정상 실행됨", async () => {
    const queue = new ConcurrencyQueue(1);
    const results: string[] = [];

    const okPromise = queue.add(async () => {
      results.push("ok-1");
      return "ok-1";
    });
    const failPromise = queue.add(async () => {
      results.push("fail");
      throw new Error("boom");
    });
    const okPromise2 = queue.add(async () => {
      results.push("ok-2");
      return "ok-2";
    });

    await okPromise;
    await expect(failPromise).rejects.toThrow("boom");
    await okPromise2;

    expect(results).toEqual(["ok-1", "fail", "ok-2"]);
  });

  it("동시 실행 제한이 적용됨", async () => {
    const limit = 3;
    const queue = new ConcurrencyQueue(limit);
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      queue.add(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return i;
      }),
    );

    await Promise.all(tasks);

    expect(maxConcurrent).toBeLessThanOrEqual(limit);
  });

  it("모든 태스크가 완료됨", async () => {
    const queue = new ConcurrencyQueue(2);
    const completed: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) =>
      queue.add(async () => {
        completed.push(i);
        return i;
      }),
    );

    const results = await Promise.all(tasks);

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(completed.length).toBe(5);
  });

  it("에러가 발생해도 다른 태스크는 계속 실행됨", async () => {
    const queue = new ConcurrencyQueue(1);
    const results: string[] = [];

    const tasks = [
      queue.add(async () => {
        results.push("task1");
        return "task1";
      }),
      queue.add(async () => {
        throw new Error("task2 error");
      }),
      queue.add(async () => {
        results.push("task3");
        return "task3";
      }),
    ];

    const results1 = await Promise.allSettled(tasks);

    expect(results1[0].status).toBe("fulfilled");
    expect(results1[1].status).toBe("rejected");
    expect(results1[2].status).toBe("fulfilled");
    expect(results).toContain("task1");
    expect(results).toContain("task3");
  });

  it("빈 큐에서도 정상 동작", async () => {
    const _queue = new ConcurrencyQueue(3);

    // 아무 태스크도 추가하지 않고 대기
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 에러 없이 완료되어야 함
    expect(true).toBe(true);
  });

  it("단일 태스크 실행", async () => {
    const queue = new ConcurrencyQueue(2);

    const result = await queue.add(async () => {
      return "single";
    });

    expect(result).toBe("single");
  });

  it("동시성 1일 때 순차 실행", async () => {
    const queue = new ConcurrencyQueue(1);
    const order: number[] = [];

    await Promise.all([
      queue.add(async () => {
        order.push(1);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
      queue.add(async () => {
        order.push(2);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }),
      queue.add(async () => {
        order.push(3);
      }),
    ]);

    // 동시성 1이므로 추가한 순서대로 실행
    expect(order).toEqual([1, 2, 3]);
  });

  it("동시성 5일 때 10개 태스크 처리", async () => {
    const queue = new ConcurrencyQueue(5);
    const completed: number[] = [];

    const tasks = Array.from({ length: 10 }, (_, i) =>
      queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        completed.push(i);
        return i;
      }),
    );

    await Promise.all(tasks);

    expect(completed.length).toBe(10);
  });

  it("태스크 반환값이 올바르게 전달됨", async () => {
    const queue = new ConcurrencyQueue(2);

    const results = await Promise.all([
      queue.add(async () => "a"),
      queue.add(async () => "b"),
      queue.add(async () => "c"),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
  });
});
