import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://127.0.0.1:5180";
try {
  await page.goto(base);
  await expect(page.getByLabel("사용자 역할 전환")).toBeVisible();
  await page.getByLabel("사용자 역할 전환").selectOption("requester");
  await page.getByRole("link", { name: "SR 접수", exact: true }).click();
  await page.getByLabel("요청 제목").fill("재검증 SR 요청");
  await page.getByRole("button", { name: "접수 대화 시작" }).click();
  await expect(
    page.getByRole("heading", {
      name: "재검증 SR 요청",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page.getByLabel("대화 입력").fill("세척 주기 알림이 필요합니다.");
  await page
    .getByRole("button", { name: "assistant 호출", exact: true })
    .click();
  await expect(page.getByText(/요청: 완료/)).toBeVisible();
  await page.getByRole("button", { name: "지금 SR 접수" }).click();
  await expect(
    page.locator(".toast").filter({ hasText: "SR 접수가 완료되었습니다." }),
  ).toBeVisible();
  const request = await page.evaluate(async () => {
    const { hubDB } = await import("/src/db/schema.ts");
    return (await hubDB.table("requests").toArray()).find(
      (r) => r.title === "재검증 SR 요청",
    );
  });
  assert.ok(request.number);
  assert.equal(request.status, "received");
  await page.getByLabel("사용자 역할 전환").selectOption("staff");
  await page.goto(base + "/#/work/" + request.workId);
  await page
    .getByRole("button", { name: "요청자에게 공유", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.locator("select").selectOption(request.id);
  await modal.locator("textarea").fill("요청자에게 공개한 검토 결과");
  await modal.getByRole("button", { name: /공유/ }).click();
  await page.goto(base + "/#/agent/urs");
  const card = page
    .locator(".board-work")
    .filter({ has: page.getByText("재검증 SR 요청", { exact: true }) });
  await card.locator("select").selectOption("done");
  await page.getByRole("dialog").locator("textarea").fill("시연 검토 완료");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page.goto(base + "/#/work/" + request.workId);
  await expect(page.getByText(/완료된 업무입니다/)).toBeVisible();
  await expect(page.getByLabel("비즈니스 목적 확인")).toBeDisabled();
  await page.getByLabel("메모", { exact: true }).fill("완료 후 추가 메모");
  await page.getByRole("button", { name: "메모 남기기", exact: true }).click();
  await expect(
    page.getByText("완료 후 추가 메모", { exact: true }),
  ).toBeVisible();
  await page.goto(base + "/#/agent/urs");
  await page
    .locator(".board-work")
    .filter({ has: page.getByText("재검증 SR 요청", { exact: true }) })
    .locator("select")
    .selectOption("active");
  await page.getByRole("dialog").locator("textarea").fill("후속 검토 재개");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page.goto(base + "/#/work/" + request.workId);
  await expect(page.getByLabel("비즈니스 목적 확인")).toBeEnabled();
  await expect(
    page.getByText("완료 후 추가 메모", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("사용자 역할 전환").selectOption("requester");
  await page.goto(base + "/#/requests/" + request.id);
  await expect(
    page.getByText("요청자에게 공개한 검토 결과", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("완료 후 추가 메모", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("사용자 역할 전환").selectOption("admin");
  await page.goto(base + "/#/admin");
  await page.getByText("전체 데이터 백업·복원", { exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 백업 다운로드" }).click();
  const backup = await downloading;
  const other = await context.newPage();
  await other.goto(base + "/#/work/" + request.workId);
  await other.getByLabel("메모", { exact: true }).fill("백업 이후 변경");
  await other.getByRole("button", { name: "메모 남기기", exact: true }).click();
  await expect(
    other.getByText("백업 이후 변경", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("백업 파일 검사").setInputFiles(await backup.path());
  await expect(
    page.getByRole("button", { name: "검사한 백업으로 교체" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "검사한 백업으로 교체" }).click();
  await expect(
    other.getByText(/백업 복원으로 데이터가 교체되었습니다/),
  ).toBeVisible();
  await page.goto(base + "/#/work/" + request.workId);
  await expect(
    page.getByText("완료 후 추가 메모", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("백업 이후 변경", { exact: true })).toHaveCount(
    0,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: SR chat/submit/share privacy, completion lock/note/reopen, backup restore and stale-tab invalidation; no page errors",
  );
} finally {
  await browser.close();
}
