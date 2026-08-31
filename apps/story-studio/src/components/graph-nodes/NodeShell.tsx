import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";

export function NodeShell(props: { family: string; status: string; selected?: boolean; running?: boolean; ariaLabel: string; children: ReactNode }) {
  return <article className={`graph-node-shell is-${props.family} ${props.selected ? "is-selected" : ""} ${props.running ? "is-running" : ""}`} data-node-family={props.family} data-node-status={props.status} aria-label={props.ariaLabel} tabIndex={0}>{props.children}</article>;
}

export function GraphPort(props: { type: "source" | "target"; position: Position; connectable?: boolean; label: string }) {
  return <Handle type={props.type} position={props.position} isConnectable={props.connectable} className="graph-node-port" aria-label={props.label} title={props.label} />;
}
