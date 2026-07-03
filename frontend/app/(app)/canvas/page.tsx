"use client"

// 采集画布 — Houdini-style three-tier node editor (项目 → 功能 → 实现).
// Batch-1 port: the pure view-model (lib/plan-canvas-model.ts) is reused
// verbatim; this page re-wraps it in the new shadcn design system.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Boxes,
  ChevronLeft,
  Database,
  GitMerge,
  Group,
  HardDriveDownload,
  Ungroup,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  buildSubnetView,
  fallbackPosition,
  listCanvasGroups,
  planGraphToCanvas,
  readCanvasGroup,
  withCanvasGroup,
  type CanvasEdge,
  type CanvasGraph,
} from "@/lib/plan-canvas-model"
import type { PlanEdge, PlanNode, PlanNodeKind } from "@/lib/plan-types"
import { cn } from "@/lib/utils"

// ── Node kinds ───────────────────────────────────────────────────────────────

const KIND_META: Record<
  PlanNodeKind,
  { label: string; icon: typeof Database; accent: string }
> = {
  source: { label: "源", icon: Database, accent: "text-primary" },
  transform: { label: "变换", icon: Wand2, accent: "text-success" },
  merge: { label: "合并", icon: GitMerge, accent: "text-warning" },
  sink: { label: "汇", icon: HardDriveDownload, accent: "text-destructive" },
}

type FlowNode = Node<{ planNode?: PlanNode; label: string; count?: number }>
type FlowEdge = Edge

const EDGE_STYLE = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
}

// ── Custom nodes ─────────────────────────────────────────────────────────────

function PlanFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const planNode = data.planNode
  if (!planNode) return null
  const meta = KIND_META[planNode.kind]
  const Icon = meta.icon
  return (
    <div
      className={cn(
        "bg-card min-w-40 rounded-lg border px-3 py-2.5 shadow-sm transition-colors",
        selected ? "border-ring ring-ring/30 ring-2" : "hover:border-muted-foreground/40",
      )}
    >
      {planNode.kind !== "source" && (
        <Handle type="target" id={planNode.inputs[0]?.name ?? "in"} position={Position.Left} />
      )}
      {planNode.kind === "merge" && planNode.inputs[1] && (
        <Handle
          type="target"
          id={planNode.inputs[1].name}
          position={Position.Left}
          style={{ top: "70%" }}
        />
      )}
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", meta.accent)} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {data.label}
          </span>
          <span className="text-muted-foreground text-xs">{meta.label}</span>
        </div>
      </div>
      {planNode.kind !== "sink" && (
        <Handle type="source" id={planNode.outputs[0]?.name ?? "out"} position={Position.Right} />
      )}
    </div>
  )
}

const SUBNET_PREFIX = "__subnet-"
const subnetId = (gid: string) => `${SUBNET_PREFIX}${gid}`
const groupIdOf = (flowId: string) =>
  flowId.startsWith(SUBNET_PREFIX) ? flowId.slice(SUBNET_PREFIX.length) : null

function SubnetFlowNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        "bg-card min-w-44 rounded-lg border-2 border-dashed px-4 py-3 shadow-sm transition-colors",
        selected ? "border-ring" : "hover:border-muted-foreground/50",
      )}
    >
      <Handle type="target" id="in" position={Position.Left} isConnectable={false} />
      <div className="flex items-center gap-2.5">
        <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-md">
          <Boxes className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{data.label}</span>
          <span className="text-muted-foreground text-xs">
            功能组 · {data.count ?? 0} 个节点
          </span>
        </div>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">双击进入</p>
      <Handle type="source" id="out" position={Position.Right} isConnectable={false} />
    </div>
  )
}

const nodeTypes = { plan: PlanFlowNode, __subnet: SubnetFlowNode }

// ── Canvas ───────────────────────────────────────────────────────────────────

function makeNode(kind: PlanNodeKind, id: string): PlanNode {
  return {
    id,
    kind,
    type: kind,
    label: null,
    params: {},
    required_params: [],
    inputs:
      kind === "source"
        ? []
        : kind === "merge"
          ? [
              { name: "a", type: "any" },
              { name: "b", type: "any" },
            ]
          : [{ name: "in", type: "any" }],
    outputs: kind === "sink" ? [] : [{ name: "out", type: "any" }],
    source_id: null,
    draft: false,
  }
}

function CanvasInner() {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const seq = useRef(0)

  const [planNodes, setPlanNodes] = useState<PlanNode[]>([])
  const [planEdges, setPlanEdges] = useState<PlanEdge[]>([])
  const positionsRef = useRef(new Map<string, { x: number; y: number }>())

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<FlowEdge>([])

  // 三层层级: null = 功能层; group id = 实现层 dive
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const planGroups = useMemo(() => listCanvasGroups(planNodes), [planNodes])
  const activeGroupInfo = activeGroup
    ? (planGroups.find((g) => g.id === activeGroup) ?? null)
    : null

  const currentGraph: CanvasGraph = useMemo(() => {
    const graph = planGraphToCanvas({
      ir_version: "1.0.0",
      draft: false,
      nodes: planNodes,
      edges: planEdges,
    })
    return {
      ...graph,
      nodes: graph.nodes.map((n) => ({
        ...n,
        position: positionsRef.current.get(n.id) ?? n.position,
      })),
    }
  }, [planNodes, planEdges])

  const view = useMemo(
    () => buildSubnetView(currentGraph, activeGroup),
    [currentGraph, activeGroup],
  )

  useEffect(() => {
    setRfNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]))
      const atomic: FlowNode[] = view.nodes.map((n, i) => ({
        id: n.id,
        type: "plan",
        position: posById.get(n.id) ?? n.position ?? fallbackPosition(i),
        data: {
          planNode: n.planNode,
          label: n.planNode.label || `${KIND_META[n.planNode.kind].label}-${n.id.slice(-4)}`,
        },
      }))
      const subnets: FlowNode[] = view.subnets.map((s) => ({
        id: subnetId(s.group.id),
        type: "__subnet",
        position: posById.get(subnetId(s.group.id)) ?? s.position,
        data: { label: s.group.label, count: s.memberCount },
      }))
      return [...atomic, ...subnets]
    })
  }, [view, setRfNodes])

  useEffect(() => {
    setRfEdges(
      view.edges.map((e: CanvasEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        ...EDGE_STYLE,
      })),
    )
  }, [view, setRfEdges])

  // ── Add / connect / drop ───────────────────────────────────────────────────

  const addNodeAt = useCallback(
    (kind: PlanNodeKind, position: { x: number; y: number }): string => {
      const id = `n-${Date.now()}-${seq.current++}`
      let node = makeNode(kind, id)
      if (activeGroupInfo) node = withCanvasGroup(node, activeGroupInfo)
      positionsRef.current.set(id, position)
      setPlanNodes((prev) => [...prev, node])
      return id
    },
    [activeGroupInfo],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      const id = `e-${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}`
      setPlanEdges((prev) => [
        ...prev,
        {
          id,
          source_node: params.source,
          source_port: params.sourceHandle ?? "out",
          target_node: params.target,
          target_port: params.targetHandle ?? "in",
        },
      ])
    },
    [],
  )

  // Edge-drop menu (ReactFlow "add node on edge drop" pattern)
  const [dropMenu, setDropMenu] = useState<{
    client: { x: number; y: number }
    flow: { x: number; y: number }
    fromNode: string
    fromHandle: string
  } | null>(null)

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      state: {
        isValid: boolean | null
        fromNode: { id: string } | null
        fromHandle: { id?: string | null } | null
      },
    ) => {
      if (state.isValid || !state.fromNode) return
      const { clientX, clientY } =
        "changedTouches" in event ? event.changedTouches[0] : event
      setDropMenu({
        client: { x: clientX, y: clientY },
        flow: screenToFlowPosition({ x: clientX, y: clientY }),
        fromNode: state.fromNode.id,
        fromHandle: state.fromHandle?.id ?? "out",
      })
    },
    [screenToFlowPosition],
  )

  const insertFromDrop = useCallback(
    (kind: Exclude<PlanNodeKind, "source">) => {
      if (!dropMenu) return
      const newId = addNodeAt(kind, dropMenu.flow)
      const targetPort = kind === "merge" ? "a" : "in"
      setPlanEdges((prev) => [
        ...prev,
        {
          id: `e-${dropMenu.fromNode}-${dropMenu.fromHandle}-${newId}-${targetPort}`,
          source_node: dropMenu.fromNode,
          source_port: dropMenu.fromHandle,
          target_node: newId,
          target_port: targetPort,
        },
      ])
      setDropMenu(null)
    },
    [dropMenu, addNodeAt],
  )

  // ── Grouping ───────────────────────────────────────────────────────────────

  const selectedIds = useMemo(
    () => rfNodes.filter((n) => n.selected && !n.id.startsWith(SUBNET_PREFIX)).map((n) => n.id),
    [rfNodes],
  )

  const groupSelection = useCallback(() => {
    if (selectedIds.length < 2) return
    const ids = new Set(selectedIds)
    const gid = `g-${Date.now()}`
    const label = `功能组 ${planGroups.length + 1}`
    setPlanNodes((prev) =>
      prev.map((n) => (ids.has(n.id) ? withCanvasGroup(n, { id: gid, label }) : n)),
    )
    toast.success(`已组合 ${ids.size} 个节点，双击子网节点进入`)
  }, [selectedIds, planGroups.length])

  const dissolveGroup = useCallback(() => {
    if (!activeGroup) return
    setPlanNodes((prev) =>
      prev.map((n) => (readCanvasGroup(n)?.id === activeGroup ? withCanvasGroup(n, null) : n)),
    )
    setActiveGroup(null)
  }, [activeGroup])

  const renameGroup = useCallback(
    (label: string) => {
      if (!activeGroup || !label.trim()) return
      setPlanNodes((prev) =>
        prev.map((n) =>
          readCanvasGroup(n)?.id === activeGroup
            ? withCanvasGroup(n, { id: activeGroup, label: label.trim() })
            : n,
        ),
      )
    },
    [activeGroup],
  )

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 60)
    return () => clearTimeout(t)
  }, [activeGroup, fitView])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded-lg border">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        nodeTypes={nodeTypes}
        onNodeDoubleClick={(_, node) => {
          const gid = groupIdOf(node.id)
          if (gid) setActiveGroup(gid)
        }}
        onNodeDragStop={(_, node) => {
          positionsRef.current.set(node.id, node.position)
        }}
        onPaneClick={() => setDropMenu(null)}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        connectionLineType={ConnectionLineType.SmoothStep}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable />

        {/* 层级面包屑 */}
        <Panel position="top-left">
          <div className="bg-card flex items-center gap-1.5 rounded-lg border p-1.5 shadow-sm">
            {activeGroup ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setActiveGroup(null)}>
                  <ChevronLeft data-icon="inline-start" />
                  功能层
                </Button>
                <Separator orientation="vertical" className="h-4" />
                <Input
                  value={activeGroupInfo?.label ?? ""}
                  onChange={(e) => renameGroup(e.target.value)}
                  aria-label="功能组名称"
                  className="h-8 w-36"
                />
                <Button variant="ghost" size="sm" onClick={dissolveGroup}>
                  <Ungroup data-icon="inline-start" />
                  解散
                </Button>
              </>
            ) : (
              <>
                <span className="text-muted-foreground flex items-center gap-1.5 px-2 text-sm font-medium">
                  <Boxes className="size-4" />
                  功能层
                </span>
                {selectedIds.length >= 2 && (
                  <Button size="sm" onClick={groupSelection}>
                    <Group data-icon="inline-start" />
                    组合为功能组 ({selectedIds.length})
                  </Button>
                )}
              </>
            )}
          </div>
        </Panel>

        {/* 节点面板 */}
        <Panel position="top-right">
          <div className="bg-card flex flex-col gap-1 rounded-lg border p-1.5 shadow-sm">
            {(Object.keys(KIND_META) as PlanNodeKind[]).map((kind) => {
              const meta = KIND_META[kind]
              const Icon = meta.icon
              return (
                <Button
                  key={kind}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    const center = screenToFlowPosition({
                      x: window.innerWidth / 2,
                      y: window.innerHeight / 2,
                    })
                    addNodeAt(kind, {
                      x: center.x + Math.random() * 60 - 30,
                      y: center.y + Math.random() * 60 - 30,
                    })
                  }}
                >
                  <Icon data-icon="inline-start" className={meta.accent} />
                  {meta.label}
                </Button>
              )
            })}
          </div>
        </Panel>
      </ReactFlow>

      {/* Edge-drop 菜单 */}
      {dropMenu && (
        <div
          role="menu"
          aria-label="添加下游节点"
          className="bg-popover text-popover-foreground fixed z-50 w-44 overflow-hidden rounded-lg border shadow-md"
          style={{ left: dropMenu.client.x + 4, top: dropMenu.client.y + 4 }}
        >
          <p className="text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
            添加下游节点
          </p>
          {(["transform", "merge", "sink"] as const).map((kind) => {
            const meta = KIND_META[kind]
            const Icon = meta.icon
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => insertFromDrop(kind)}
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              >
                <Icon className={cn("size-4", meta.accent)} />
                {meta.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CanvasPage() {
  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">采集画布</h1>
          <p className="text-muted-foreground text-sm">
            三层节点编辑：框选组合功能组，双击子网钻入，拖线到空白处快速加节点
          </p>
        </div>
      </div>
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  )
}
