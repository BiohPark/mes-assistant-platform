import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Agent } from "./types";
import { getBlob } from "./files";
export const statusLabels = {
  waiting: "대기",
  active: "진행 중",
  review: "검토 필요",
  done: "완료",
};
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Avatar({ agent, size = 48 }: { agent: Agent; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let object = "";
    setUrl("");
    if (agent.imageId)
      getBlob(agent.imageId)
        .then((b) => {
          if (active && b) {
            object = URL.createObjectURL(b);
            setUrl(object);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [agent.imageId]);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: agent.color || "#e8efe9",
      }}
    >
      {url ? (
        <img src={url} alt={agent.name} onError={() => setUrl("")} />
      ) : (
        agent.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
