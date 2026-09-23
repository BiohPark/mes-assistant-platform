import { it, expect, vi } from "vitest";
import {
  endpoint,
  buildMessages,
  requestCompletion,
  discoverModels,
} from "./llm";
import { DEFAULT_CONNECTION } from "./workflow";
const config = {
  ...DEFAULT_CONNECTION,
  mode: "api" as const,
  baseUrl: "https://internal.example/api",
};
it("keeps configured API prefix and rejects URL/path escape", () => {
  expect(endpoint(config.baseUrl, config.chatPath)).toBe(
    "https://internal.example/api/chat/completions",
  );
  for (const path of ["https://other/a", "//other/a", "/../a", "/x?key=secret"])
    expect(() => endpoint(config.baseUrl, path)).toThrow();
});
it("isolates threads and labels participant text without changing message roles", () => {
  const result = buildMessages(
    [
      {
        id: "1",
        role: "user",
        actor: "담당자 A",
        content: "검토",
        at: "",
        threadId: "a",
      },
      {
        id: "2",
        role: "user",
        actor: "담당자 C",
        content: "승인 조건",
        at: "",
        threadId: "b",
      },
    ],
    "a",
    false,
  );
  expect(result).toHaveLength(1);
  expect(result[0].role).toBe("user");
  expect(result[0].content).toContain("담당자 A");
  expect(result[0].content).not.toContain("승인 조건");
  expect(result[0]).not.toHaveProperty("name");
});
it("sends selected model and auth with a genuine Chat Completions request", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
      ),
    );
  expect(
    await requestCompletion(
      config,
      "secret",
      "custom-model",
      [],
      new AbortController().signal,
      fetcher,
    ),
  ).toBe("OK");
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://internal.example/api/chat/completions");
  expect(JSON.parse(init.body)).toEqual({
    model: "custom-model",
    messages: [],
    stream: false,
  });
  expect(init.headers.Authorization).toBe("Bearer secret");
});
it("never substitutes a demo response for an API error or malformed response", async () => {
  await expect(
    requestCompletion(
      config,
      "",
      "m",
      [],
      new AbortController().signal,
      vi.fn().mockResolvedValue(new Response("private", { status: 401 })),
    ),
  ).rejects.toThrow("401");
  await expect(
    requestCompletion(
      config,
      "",
      "m",
      [],
      new AbortController().signal,
      vi.fn().mockResolvedValue(new Response("{}")),
    ),
  ).rejects.toThrow("텍스트");
});
it("parses discovered model IDs", async () => {
  expect(
    await discoverModels(
      config,
      "",
      new AbortController().signal,
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"data":[{"id":"a"},{"id":"a"},{"id":"b"}]}'),
        ),
    ),
  ).toEqual(["a", "b"]);
});
