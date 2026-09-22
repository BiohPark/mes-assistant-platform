import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  FileText,
  Download,
  ArrowUpRight,
  Bot,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import type { Artifact, Stage } from "./types";
import { useStore } from "./store";
import { downloadArtifact, getFile } from "./storage";
export function Avatar({
  name,
  small = false,
}: {
  name?: string;
  small?: boolean;
}) {
  const colors = ["mint", "lavender", "peach", "blue"];
  const safeName = (name || "사용자").trim() || "사용자";
  const sum = [...safeName].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={`avatar ${colors[sum % 4]} ${small ? "small" : ""}`}>
      {safeName.slice(-2)}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export const statusLabel: Record<Stage["status"], string> = {
  pending: "대기",
  active: "진행 중",
  done: "완료",
  skipped: "건너뜀",
  review: "재검토",
};
export const statusTone: Record<Stage["status"], string> = {
  pending: "neutral",
  active: "green",
  done: "green",
  skipped: "neutral",
  review: "amber",
};
export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
export const formatTime = (date: string) =>
  new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const sizeLabel = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function FileCard({
  artifact,
  onRemove,
  compact = false,
}: {
  artifact: Artifact;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const { notify } = useStore();
  return (
    <>
      <div className={`file-card ${compact ? "compact" : ""}`}>
        <button className="file-main" onClick={() => setPreview(true)}>
          <span
            className={`file-icon ${artifact.mime.includes("csv") ? "csv" : ""}`}
          >
            {artifact.mime.startsWith("image") ? (
              <ImageIcon size={19} />
            ) : (
              <FileText size={19} />
            )}
          </span>
          <span>
            <strong>{artifact.name}</strong>
            <small>
              v{artifact.version} · {sizeLabel(artifact.size)}
              {!compact && ` · ${artifact.createdBy}`}
            </small>
          </span>
        </button>
        <button
          className="icon-button"
          title="파일 다운로드"
          aria-label={`${artifact.name} 다운로드`}
          onClick={() =>
            downloadArtifact(artifact).catch(() =>
              notify("파일 다운로드에 실패했습니다."),
            )
          }
        >
          <Download size={15} />
        </button>
        {onRemove && (
          <button
            className="icon-button"
            title="입력 연결 해제"
            aria-label={`${artifact.name} 입력 연결 해제`}
            onClick={onRemove}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {preview && (
        <FilePreview artifact={artifact} onClose={() => setPreview(false)} />
      )}
    </>
  );
}
function FilePreview({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [content, setContent] = useState("불러오는 중…"),
    [url, setUrl] = useState("");
  const { notify } = useStore();
  useEffect(() => {
    let active = true,
      objectUrl = "";
    getFile(artifact)
      .then(async (blob) => {
        if (artifact.mime.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          if (active) setUrl(objectUrl);
        } else if (
          artifact.mime.startsWith("text/") ||
          /\.(md|json|csv|txt)$/i.test(artifact.name)
        ) {
          const text = await blob.text();
          if (active) setContent(text);
        } else if (active)
          setContent(
            "이 파일 형식은 다운로드 후 전용 프로그램에서 확인할 수 있습니다.",
          );
      })
      .catch(() => setContent("저장된 파일을 불러올 수 없습니다."));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact]);
  return (
    <Modal
      title={artifact.name}
      subtitle={`버전 ${artifact.version} · ${artifact.createdBy} · ${formatDate(artifact.createdAt)}`}
      onClose={onClose}
      wide
    >
      {url ? (
        <img className="preview-image" src={url} alt={artifact.name} />
      ) : (
        <pre className="file-preview">{content}</pre>
      )}
      <div className="modal-footer">
        <button
          className="button primary"
          onClick={() =>
            downloadArtifact(artifact).catch(() =>
              notify("다운로드에 실패했습니다."),
            )
          }
        >
          <Download size={16} />
          다운로드
        </button>
      </div>
    </Modal>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FileText size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function AssistantMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`assistant-mark ${small ? "small" : ""}`}>
      <Bot size={small ? 16 : 22} />
    </span>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function CheckRow({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`check-row ${checked ? "checked" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="custom-check">{checked && <Check size={12} />}</span>
      <span>{label}</span>
    </label>
  );
}
export function SmallLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
