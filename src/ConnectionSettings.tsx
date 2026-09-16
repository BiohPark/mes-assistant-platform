import { useEffect, useRef, useState } from "react";
import { PlugZap, RefreshCw, Check } from "lucide-react";
import { Modal } from "./ui";
import { useStore } from "./store";
import { DEFAULT_CONNECTION } from "./workflow";
import { discoverModels, endpoint } from "./llm";

export function ConnectionSettings({ onClose }: { onClose: () => void }) {
  const { state, update, notify, apiKey, setApiKey } = useStore();
  const [config, setConfig] = useState({
    ...DEFAULT_CONNECTION,
    ...state.connection,
  });
  const [key, setKey] = useState(apiKey),
    [modelText, setModelText] = useState(config.models.join("\n"));
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const models = [
    ...new Set(
      modelText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  async function discover() {
    setError("");
    setStatus("");
    setBusy(true);
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 60000);
    try {
      const list = await discoverModels(config, key, controller.current.signal);
      setModelText([...new Set([...models, ...list])].join("\n"));
      setStatus(
        `${list.length}개 모델을 조회했습니다. 대화 호출 가능 여부는 실제 전송 시 확인됩니다.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="사내 API · 모델 설정"
      subtitle="OpenAI compatible Chat Completions · 브라우저 직접 연결"
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          try {
            if (config.mode === "api") {
              endpoint(config.baseUrl, config.chatPath);
              endpoint(config.baseUrl, config.modelsPath);
            }
            if (!models.length || !models.includes(config.defaultModel))
              throw new Error("모델 목록에 포함된 기본 모델을 선택해 주세요.");
            update((s) => ({
              ...s,
              connection: { ...config, baseUrl: config.baseUrl.trim(), models },
            }));
            setApiKey(key);
            notify("API 및 모델 설정을 저장했습니다.");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="connection-mode">
          {(["demo", "api"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              className={config.mode === mode ? "active" : ""}
              onClick={() => setConfig({ ...config, mode })}
            >
              <PlugZap size={18} />
              <strong>{mode === "demo" ? "샘플 응답" : "사내 API"}</strong>
              <small>
                {mode === "demo"
                  ? "연결 없이 UI 체험"
                  : "설정한 서버에 실제 요청"}
              </small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="form-label">
            API 기본 URL
            <input
              value={config.baseUrl}
              onChange={(e) =>
                setConfig({ ...config, baseUrl: e.target.value })
              }
              placeholder="https://llm.company.local/v1"
            />
            <small>
              API 접두 경로까지 입력합니다. 아래 경로가 이어 붙습니다.
            </small>
          </label>
          <label className="form-label">
            API 키 (선택)
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Bearer token"
            />
            <small>메모리에만 보관 · 새로고침 시 다시 입력</small>
          </label>
          <label className="form-label">
            대화 경로
            <input
              value={config.chatPath}
              onChange={(e) =>
                setConfig({ ...config, chatPath: e.target.value })
              }
            />
          </label>
          <label className="form-label">
            모델 목록 경로
            <input
              value={config.modelsPath}
              onChange={(e) =>
                setConfig({ ...config, modelsPath: e.target.value })
              }
            />
          </label>
        </div>
        <div className="connection-note">
          브라우저에서 API 서버로 직접 요청합니다. 서버의 CORS 허용이
          필요합니다. OpenWebUI assistant를 이용하려면 해당 설치의 endpoint와
          assistant 모델 ID를 지정하세요. 기반 모델 ID만 선택하면 기존
          skill·knowledge가 자동 적용되지는 않습니다.
        </div>
        <div className="form-grid">
          <label className="form-label">
            사용 가능한 모델 ID
            <textarea
              rows={4}
              value={modelText}
              onChange={(e) => setModelText(e.target.value)}
              placeholder="한 줄에 하나의 모델 ID"
            />
            <small>목록 조회를 지원하지 않으면 직접 입력하세요.</small>
          </label>
          <label className="form-label">
            시스템 기본 모델
            <select
              value={config.defaultModel}
              onChange={(e) =>
                setConfig({ ...config, defaultModel: e.target.value })
              }
            >
              <option value="">모델 선택</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              disabled={busy || !config.baseUrl.trim()}
              onClick={discover}
            >
              <RefreshCw size={15} />
              {busy ? "모델 조회 중…" : "모델 목록 조회"}
            </button>
          </label>
        </div>
        <label className="check-option">
          <input
            type="checkbox"
            checked={config.sendNames}
            onChange={(e) =>
              setConfig({ ...config, sendNames: e.target.checked })
            }
          />{" "}
          요청에 참여자 name 필드 추가 (지원 서버만)
        </label>
        <p className="muted">
          작성자 표기는 항상 메시지 본문에 포함됩니다. name은 participant_1 등의
          식별자로 전송합니다.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="connection-success">
            {status}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            닫기
          </button>
          <button className="button primary" disabled={busy}>
            <Check size={15} />
            설정 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
