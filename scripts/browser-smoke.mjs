import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = "http://127.0.0.1:5180";
try {
  await page.goto(url + "/#/work/urs-work");
  await expect(
    page.getByRole("heading", {
      name: "설비 상태 이력 조회 개선",
      exact: true,
    }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto(url + "/#/work/urs-work");
  await expect(other.getByLabel("메모", { exact: true })).toBeVisible();
  await page.getByLabel("메모", { exact: true }).fill("탭 A 기록");
  await other.getByLabel("메모", { exact: true }).fill("탭 B 기록");
  await Promise.all([
    page.getByRole("button", { name: "메모 남기기", exact: true }).click(),
    other.getByRole("button", { name: "메모 남기기", exact: true }).click(),
  ]);
  await expect(page.getByText("탭 B 기록", { exact: true })).toBeVisible();
  await expect(other.getByText("탭 A 기록", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "업무 설정", exact: true }).click();
  await page
    .getByLabel("업무명", { exact: true })
    .fill("설비 상태 이력 조회 개선 · 검증");
  await page
    .getByRole("button", { name: "업무 설정 저장", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "설비 상태 이력 조회 개선 · 검증",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    const a = await hubDB.table("agents").get("urs");
    await hubDB.table("profiles").update(a.profileId, {
      mode: "api",
      baseUrl: "https://mock.invalid/v1",
      maxRequestBytes: 262144,
    });
    await hubDB.table("bundles").add({
      id: "e2e-context",
      name: "전송 선택 테스트",
      sourceWorkId: "urs-work",
      createdBy: "staff",
      createdAt: new Date().toISOString(),
      excerpts: [],
      artifactIds: [],
      summary: "UNIQUE_SELECTED_CONTEXT",
      note: "",
    });
    await hubDB.table("threads").update("urs-work-thread", {
      activeBundleIds: ["e2e-context"],
      model: "thread-model",
    });
  });
  let pending;
  let submitted;
  await context.route("https://mock.invalid/**", async (route) => {
    submitted = route.request().postDataJSON();
    pending = route;
  });
  await page.getByLabel("대화 입력").fill("첫 번째 API 질문");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect.poll(() => !!pending).toBe(true);
  assert.equal(submitted.model, "thread-model");
  assert.ok(JSON.stringify(submitted).includes("UNIQUE_SELECTED_CONTEXT"));
  await expect(
    page.getByText("첫 번째 API 질문", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("활성 컨텍스트 제거").click();
  await pending.fulfill({
    json: {
      model: "actual-model",
      choices: [{ message: { content: "첫 번째 API 응답" } }],
    },
  });
  pending = undefined;
  await expect(
    page.getByText("첫 번째 API 응답", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("첫 번째 API 응답", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("대화 입력").fill("두 번째 API 질문");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect.poll(() => !!pending).toBe(true);
  assert.ok(!JSON.stringify(submitted).includes("UNIQUE_SELECTED_CONTEXT"));
  await pending.fulfill({ status: 503, body: "unavailable" });
  pending = undefined;
  await expect(page.getByText(/API 응답 오류 \(503\)/)).toBeVisible();
  await page.getByRole("button", { name: "현재 선택 자료로 재시도" }).click();
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole("button", { name: "요청 중지", exact: true }).click();
  await expect(page.getByText(/요청: 중지됨/)).toBeVisible();
  await pending
    .fulfill({
      json: {
        model: "late",
        choices: [{ message: { content: "늦은 응답은 숨김" } }],
      },
    })
    .catch(() => {});
  pending = undefined;
  await expect(page.getByText("늦은 응답은 숨김", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("사용자 역할 전환").selectOption("requester");
  await page.goto(url + "/#/work/urs-work");
  await expect(page.getByText("첫 번째 API 응답", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "전송 기록", exact: true }),
  ).toHaveCount(0);
  await expect(other.getByLabel("사용자 역할 전환")).toHaveValue("staff");
  await page.getByLabel("사용자 역할 전환").selectOption("admin");
  await page.goto(url + "/#/admin");
  await page.getByText("전체 데이터 백업·복원", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 백업 다운로드" }).click();
  const file = await download;
  assert.ok(file.suggestedFilename().includes("backup"));
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: two-tab append, tab-local role, slow API, frozen/removed context, model provenance, failure/retry/cancel, requester privacy, reload, backup download; no page errors",
  );
} finally {
  await browser.close();
}
