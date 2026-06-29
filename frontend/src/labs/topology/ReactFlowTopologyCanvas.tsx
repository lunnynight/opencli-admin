import { useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { TopologyHealth, TopologyNodeData } from './topologyModel'
import { ALL_NODES, hasNode, nodeTypesForXyflow, registerNodes } from '../../node-kit'

// The collection.* specs must exist before this canvas mounts (it may mount
// before NetworkPage runs its own registerNodes). Idempotent: the registry is a
// Map keyed by type, so registering again just overwrites with the same spec.
registerNodes(ALL_NODES)

type TopologyNodeViewData = TopologyNodeData & { onDive?: () => void }
type TopologyFlowNode = Node<TopologyNodeViewData>
type TopologyFlowEdge = Edge<{ health: TopologyHealth }>

interface ReactFlowTopologyCanvasProps {
  nodes: Array<Node<TopologyNodeData>>
  edges: TopologyFlowEdge[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  /** Changes on dive (L0↔L1); drives an animated fitView instead of a remount. */
  viewKey?: string
  headerLabel?: string
}

// M3 emphasized-decelerate ~ approximated as easeOutQuart for the d3 viewport tween.
const m3Decel = (t: number) => 1 - Math.pow(1 - t, 4)
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// L1/L2 stage cards now render through node-kit's <KitNode> (collection.* specs);
// the per-stage facts/config are projected from TopologyNodeData below.
function stageConfig(d: TopologyNodeData): Record<string, unknown> {
  const detail = d.detail ?? {}
  return {
    __entityId: detail.id,
    __sourceId: detail.source_id,
    __agentId: detail.agent_id,
    __badges: d.badges,
    enabled: d.health !== 'disabled',
    name: d.title,
    channel_type: d.subtitle,
    status: detail.status,
  }
}

function stageFacts(d: TopologyNodeData): Record<string, unknown> {
  return {
    状态: readDetailString(d.detail, 'current_status', healthLabel(d.health)),
    缺口: readDetailString(d.detail, 'capability_gap', '暂无能力缺口'),
  }
}

function ReactFlowTopologyCanvasInner({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodeDoubleClick,
  viewKey,
  headerLabel,
}: ReactFlowTopologyCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<TopologyFlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<TopologyFlowEdge>([])
  const { fitView } = useReactFlow()
  // One nodeTypes map from the registry (KitNode bound per spec.type). Only the
  // set of registered types matters, so it's stable for this component's life.
  const nodeTypes = useMemo(() => nodeTypesForXyflow(), [])

  // Keep dive callback in a ref so the sync effect below does NOT depend on its
  // (per-render-unstable) identity — otherwise every parent re-render rebuilds
  // all nodes and thrashes the canvas, eating clicks.
  const diveRef = useRef(onNodeDoubleClick)
  useEffect(() => {
    diveRef.current = onNodeDoubleClick
  })

  // Sync props → controlled state WITHOUT remounting. Preserve any user-dragged
  // position by id so the periodic refetches don't snap nodes back to layout.
  useEffect(() => {
    setRfNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]))
      return nodes.map((node) => {
        const isProject = readDetailString(node.data.detail, 'kind', '') === 'project'
        // KitNode reads data.config/facts; the right-drawer inspector keeps reading
        // the TopologyNodeData fields — so make data a superset of both.
        const baseData = {
          ...node.data,
          config: stageConfig(node.data),
          facts: stageFacts(node.data),
        }
        // Guard: an unregistered type makes xyflow draw a blank default node, so a
        // new/unknown backend kind would silently vanish. Fall back to a visible spec.
        const kindType = `collection.${node.data.kind}`
        return {
          ...node,
          type: hasNode(kindType) ? kindType : 'collection.source',
          position: posById.get(node.id) ?? node.position,
          selected: node.id === selectedNodeId,
          data: isProject
            ? { ...baseData, onDive: () => diveRef.current?.(node.id) }
            : baseData,
        }
      })
    })
  }, [nodes, selectedNodeId, setRfNodes])

  useEffect(() => {
    setRfEdges(
      edges.map((edge) => ({
        ...edge,
        type: 'default',
        animated: edge.data?.health === 'active' || edge.data?.health === 'healthy',
      })),
    )
  }, [edges, setRfEdges])

  // Animated viewport on level change (dive / pop) — replaces the old remount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      fitView({
        padding: 0.16,
        maxZoom: 1,
        duration: prefersReducedMotion() ? 0 : 450,
        ease: m3Decel,
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [viewKey, fitView])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onNodeDoubleClick={onNodeDoubleClick ? (_, node) => onNodeDoubleClick(node.id) : undefined}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
      minZoom={0.3}
      maxZoom={1.4}
      nodesDraggable
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      className="bg-[#060608]"
    >
      <Background variant={BackgroundVariant.Dots} color="#2a2a32" gap={22} size={1.6} />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap
        position="bottom-right"
        nodeColor={(node) => miniColor((node.data as TopologyNodeViewData).health)}
        maskColor="rgba(6, 6, 8, 0.78)"
        pannable
        zoomable
      />
      <Panel position="top-left">
        <div className="rounded-md border border-white/10 bg-black/80 px-3 py-1.5 text-[11px] text-zinc-400 shadow-lg">
          <span className="font-code text-zinc-600">{headerLabel ?? `采集管线 · ${rfNodes.length} stages`}</span>
        </div>
      </Panel>
    </ReactFlow>
  )
}

export function ReactFlowTopologyCanvas(props: ReactFlowTopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <ReactFlowTopologyCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function readDetailString(detail: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = detail?.[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function healthLabel(health: TopologyHealth) {
  const labels: Record<TopologyHealth, string> = {
    healthy: 'healthy',
    active: 'active',
    warning: 'warning',
    failed: 'failed',
    disabled: 'disabled',
    unknown: 'unknown',
  }
  return labels[health]
}

function miniColor(health: TopologyHealth) {
  const colors: Record<TopologyHealth, string> = {
    healthy: '#34d399',
    active: '#38bdf8',
    warning: '#fbbf24',
    failed: '#f87171',
    disabled: '#64748b',
    unknown: '#a1a1aa',
  }
  return colors[health]
}
