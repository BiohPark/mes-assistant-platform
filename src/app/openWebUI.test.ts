import { expect, it, vi } from "vitest";
import { sendOpenWebUI, clearRemoteFileCache } from "./openWebUI";

const profile = {
  id: "p", name: "test", mode: "api" as const, adapter: "openwebui" as const,
  baseUrl: "https://example.invalid", chatPath: "/api/chat/completions",
  modelsPath: "/api/models", models: ["model"], defaultModel: "model", sendNames: false,
};
const file = { id: "version-1", name: "evidence.txt", mime: "text/plain", size: 8,
  version: 1, workId: "w", createdBy: "staff", createdAt: "2026-01-01", content: "evidence" };
const body = { model: "model", messages: [{ role: "user", content: "review" }], stream: false as const };
it("uploads only frozen selections, waits for processing, then attaches file IDs", async () => {
  clearRemoteFileCache();
  const calls: string[] = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith("/files/")) { expect(init?.body).toBeInstanceOf(FormData); return new Response(JSON.stringify({ id: "remote-1" }), { status: 200 }); }
    if (url.includes("process/status")) return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
    const sent = JSON.parse(init?.body as string);
    expect(sent.files).toEqual([{ type: "file", id: "remote-1" }]);
    expect(JSON.stringify(sent.messages)).not.toContain("evidence");
    return new Response(JSON.stringify({ model: "actual", choices: [{ message: { content: "done" } }] }), { status: 200 });
  });
  const args = { profile, body, files: [file], key: "secret", signal: new AbortController().signal, fetcher: mock as typeof fetch };
  expect((await sendOpenWebUI(args)).content).toBe("done");
  expect(calls).toHaveLength(3);
  await sendOpenWebUI(args);
  expect(calls.filter(x => x.endsWith("/files/"))).toHaveLength(1);
});
it("stops before chat when processing fails and does not reuse IDs under a changed key", async () => {
  clearRemoteFileCache();
  let chat = 0;
  const mock = vi.fn(async (url: string) => {
    if (url.endsWith("/files/")) return new Response(JSON.stringify({ id: "remote-2" }), { status: 200 });
    if (url.includes("process/status")) return new Response(JSON.stringify({ status: "failed" }), { status: 200 });
    chat++;
    return new Response("{}", { status: 200 });
  });
  await expect(sendOpenWebUI({ profile, body, files: [file], key: "different", signal: new AbortController().signal, fetcher: mock as typeof fetch })).rejects.toThrow(/처리/);
  expect(chat).toBe(0);
});
it("cancels file processing without starting a chat request", async () => {
  clearRemoteFileCache();
  const controller = new AbortController();
  let statusStarted!: () => void;
  const waiting = new Promise<void>(resolve => { statusStarted = resolve; });
  let chats = 0;
  const mock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith("/files/")) return new Response(JSON.stringify({ id: "remote-cancel" }));
    if (url.includes("process/status")) {
      statusStarted();
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true }));
    }
    chats++;
    return new Response("{}", { status: 200 });
  });
  const pending = sendOpenWebUI({ profile, body, files: [file], key: "cancel-key", signal: controller.signal, fetcher: mock as typeof fetch });
  await waiting;
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(chats).toBe(0);
});
