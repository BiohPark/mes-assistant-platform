import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5180/");
  await expect(
    page.getByRole("button", { name: "전체 업무 칸반", exact: true }),
  ).toBeVisible();
  // Extra columns are test-only fixtures, not the shipped assistant catalog.
  await page.evaluate(async()=>{
    const {hubDB}=await import("/src/db/schema.ts");
    const template=await hubDB.table("agents").get("demo-review");
    await hubDB.table("agents").bulkPut(Array.from({length:10},(_,i)=>({...template,id:"test-agent-"+i,name:"테스트 assistant "+(i+1),intake:false})));
  });
  const count = await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    return hubDB.table("works").count();
  });
  await page
    .getByRole("button", { name: /샘플 접수 assistant/ })
    .first()
    .click();
  await expect(page.getByLabel("새 대화 입력")).toBeFocused();
  await page.goto("http://127.0.0.1:5180/");
  assert.equal(
    await page.evaluate(async () => {
      const { hubDB } = await import("/src/db/schema.ts");
      return hubDB.table("works").count();
    }),
    count,
  );
  await page.getByRole("button", { name: /샘플 검토 assistant/ }).first().click();
  await page.getByLabel("새 대화 입력").fill("첨부와 함께 남기는 첫 메시지");
  await page.getByLabel("새 대화 첨부").setInputFiles({ name: "sample.txt", mimeType: "text/plain", buffer: Buffer.from("sample") });
  await expect(page.locator(".message-body").filter({ hasText: "첨부와 함께 남기는 첫 메시지" })).toBeVisible();
  await page.goto("http://127.0.0.1:5180/");
  await page
    .getByRole("button", { name: /샘플 접수 assistant/ })
    .first()
    .click();
  await page
    .getByLabel("새 대화 입력")
    .fill("데모 설비 세척 상태 변경 요구사항");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect(page.getByText(/요청: 완료/)).toBeVisible();
  page.once("dialog", (d) => d.accept("URS 결과.md"));
  await page
    .getByRole("button", { name: "산출물로 저장", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "URS 결과.md · v1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SR 접수", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("SR 접수");
  const sr = await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    return (await hubDB.table("requests").toArray()).find((r) =>
      r.title.startsWith("데모 설비"),
    );
  });
  assert.ok(sr.number);
  await page.goto("http://127.0.0.1:5180/#/requests/" + sr.id);
  await page.getByText("연결 업무 시작", { exact: true }).click();
  await page
    .locator('a[href="#/agent/demo-writing?sr=' + sr.id + '"]')
    .click();
  await expect(page.getByLabel("새 대화 입력")).toBeVisible();
  await expect(
    page.locator(".draft-chat p").filter({ hasText: sr.number }),
  ).toBeVisible();
  await page.getByLabel("새 대화 입력").fill("FDS 요구사항 정리를 시작합니다");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect(page.getByText(/요청: 완료/)).toBeVisible();
  await expect(
    page.getByLabel("URS 결과.md v1 이번 대화에 사용"),
  ).not.toBeChecked();
  await page.getByLabel("URS 결과.md v1 이번 대화에 사용").click();
  await expect(
    page.getByLabel("URS 결과.md v1 이번 대화에 사용"),
  ).toBeChecked();
  await page.getByLabel("URS 결과.md v1 주 입력").click();
  await expect(page.getByLabel("URS 결과.md v1 주 입력")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const fdsId = page.url().split("/work/")[1];
  await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    const a = await hubDB.table("agents").get("demo-writing");
    await hubDB
      .table("profiles")
      .update(a.profileId, {
        mode: "api",
        baseUrl: "https://hub-mock.invalid",
        chatPath: "/chat/completions",
      });
  });
  let body;
  let mockOpenWebUI = false;
  const uploadCalls = [];
  await context.route("https://hub-mock.invalid/**", async (route) => {
    if (mockOpenWebUI && route.request().url().endsWith("/api/v1/files/")) {
      uploadCalls.push(route.request().url());
      return route.fulfill({ json: { id: "remote-test-file" } });
    }
    if (mockOpenWebUI && route.request().url().includes("/process/status"))
      return route.fulfill({ json: { status: "completed" } });
    body = route.request().postDataJSON();
    if (body.messages?.[0]?.role === "system") {
      const checks = JSON.parse(body.messages[1].content).checks;
      return route.fulfill({ json: { model: "assessment-model", choices: [{ message: { content: JSON.stringify({ results: checks.map(c => ({ id: c.id, verdict: "achieved", reason: "샘플 검증", references: [] })) }) } }] } });
    }
    await route.fulfill({
      json: {
        model: "verified-model",
        choices: [
          { message: { content: "FDS 검토 결과: 변경 범위 확인 완료" } },
        ],
      },
    });
  });
  await page.getByLabel("대화 모델").fill("thread-override");
  await page.getByLabel("대화 입력").fill("선택 자료로 FDS를 작성하세요");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect(
    page.getByText("FDS 검토 결과: 변경 범위 확인 완료", { exact: true }),
  ).toBeVisible();
  assert.equal(body.model, "thread-override");
  assert.ok(JSON.stringify(body).includes("[주 입력]"));
  assert.ok(JSON.stringify(body).includes("URS 결과.md"));
  await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    await hubDB.table("profiles").update("demo", {
      adapter: "openwebui",
      chatPath: "/api/chat/completions",
    });
  });
  mockOpenWebUI = true;
  await page.getByLabel("대화 입력").fill("원본 파일을 첨부해 검토하세요");
  await page.getByRole("button", { name: "assistant 호출", exact: true }).click();
  await expect.poll(() => uploadCalls.length).toBe(1);
  await expect.poll(() => body.files?.[0]?.id).toBe("remote-test-file");
  assert.ok(!JSON.stringify(body.messages).includes("[주 입력] URS 결과.md"));
  page.once("dialog", d => d.accept("근거 확인"));
  await page.getByRole("button", { name: "+ 항목 추가" }).click();
  await page.getByRole("button", { name: "AI 달성도 점검" }).click();
  await expect(page.getByText(/AI 평가 1\/1/)).toBeVisible();
  await expect(page.getByText(/현재 체크 1\/1/)).toBeVisible();
  await page.getByLabel(sr.number + " 태그 해제").click();
  await expect(page.getByLabel("URS 결과.md 입력 해제")).toBeVisible();
  await page.getByLabel("URS 결과.md 입력 해제").click();
  await page.getByLabel("대화 입력").fill("선택 자료 없이 후속 질문");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect
    .poll(() => body.messages.at(-1).content)
    .toBe("선택 자료 없이 후속 질문");
  assert.ok(!JSON.stringify(body).includes("URS 결과.md"));
  await page.getByLabel("사용자 역할 전환").selectOption("admin");
  await expect(page).toHaveURL(/#\/$/);
  await page.goto("http://127.0.0.1:5180/");
  await page.getByRole("button", { name: "SO 편집 모드" }).click();
  const originalOrder = await page.locator(".agent-card h3").allTextContents();
  await page.getByLabel(originalOrder[0] + " 뒤로", { exact: true }).click();
  await page.getByRole("button", { name: "순서 취소" }).click();
  assert.deepEqual(
    (await page.locator(".agent-card h3").allTextContents()).slice(0, 2),
    originalOrder.slice(0, 2),
  );
  await page.getByRole("button", { name: "SO 편집 모드" }).click();
  await page.getByLabel(originalOrder[0] + " 뒤로", { exact: true }).click();
  await page.getByRole("button", { name: "순서 저장" }).click();
  await page
    .getByRole("button", { name: "전체 업무 칸반", exact: true })
    .click();
  const headers = await page
    .locator(".agent-column>header strong")
    .allTextContents();
  assert.equal(headers[0], originalOrder[1]);
  assert.ok(headers.length >= 13);
  await page.getByLabel(headers[0] + " 열 접기", { exact: true }).click();
  await page.reload();
  await expect(
    page.getByLabel(headers[0] + " 열 펼치기", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("에이전트 열 점프")
    .selectOption("demo-writing");
  await expect(
    page.locator('a[href="#/work/' + fdsId + '"]').first(),
  ).toBeVisible();
  await page.screenshot({ path: ".local-only/hub-board.png", fullPage: true });
  await page
    .getByRole("button", { name: "에이전트 카드", exact: true })
    .click();
  await page.screenshot({ path: ".local-only/hub-gallery.png", fullPage: true });
  console.log(
    "PASS: delayed creation, URS→SR→FDS, direct material selection/main input, real mocked payload/model, tag detach/selection removal, shared order save/cancel, 13+ columns/collapse/reload",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
