import { describe, it, expect } from "vitest";
import { createSeed } from "./seed";
import {
  normalizeState,
  moduleKey,
  matchesModule,
  boardBucket,
  resolveModel,
  instantiateModule,
} from "./workflow";

describe("composable work migration", () => {
  it("keeps completed works visible in either filter scope", () => {
    const s = normalizeState(createSeed());
    const done = {
      ...s.works[0],
      stages: s.works[0].stages.map((t) => ({ ...t, status: "done" as const })),
    };
    expect(matchesModule(done, "completed", "includes")).toBe(true);
    expect(matchesModule(done, "completed", "current")).toBe(true);
  });
  it("preserves records and assigns stable module and thread IDs idempotently", () => {
    const seed = createSeed();
    const migrated = normalizeState(seed);
    expect(migrated.works[0].stages[0].inputs).toEqual(
      seed.works[0].stages[0].inputs,
    );
    expect(migrated.works[0].stages[0].messages.map((m) => m.id)).toEqual(
      seed.works[0].stages[0].messages.map((m) => m.id),
    );
    expect(migrated.works[0].stages[0].threads).toHaveLength(1);
    expect(normalizeState(migrated)).toEqual(migrated);
    expect(migrated.modules!.length).toBeGreaterThan(0);
  });
  it("filters heterogeneous workflows without treating absent tasks as pending", () => {
    const s = normalizeState(createSeed());
    const w = s.works[0];
    const active = w.stages.find((t) => t.status === "active")!;
    expect(matchesModule(w, moduleKey(active), "current")).toBe(true);
    expect(matchesModule(w, "absent", "includes")).toBe(false);
    expect(boardBucket(w)).toBe(moduleKey(active));
    expect(
      boardBucket({
        ...w,
        stages: w.stages.map((t) => ({ ...t, status: "done" })),
      }),
    ).toBe("completed");
  });
  it("instantiates independent checklist and follows thread > task > module > system model", () => {
    const s = normalizeState(createSeed());
    const mod = {
      ...s.modules![0],
      defaultModel: "module-model",
      checklist: ["Verify"],
    };
    s.modules = [mod];
    const task = instantiateModule(mod);
    expect(task.checklist[0].done).toBe(false);
    expect(resolveModel(s, task)).toBe("module-model");
    expect(
      resolveModel(
        s,
        { ...task, defaultModel: "task-model" },
        { id: "a", title: "A", createdAt: "", model: "thread-model" },
      ),
    ).toBe("thread-model");
    expect(instantiateModule(mod).id).not.toBe(task.id);
  });
});
