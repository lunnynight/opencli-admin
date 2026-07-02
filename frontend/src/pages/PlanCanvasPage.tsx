// Collection Canvas — edit lens (Plan IR issue 07, docs/plan-ir-PRD.md
// ADR-0008). The authoring surface: palette -> Draft Source Node -> inspector
// (materialize/edit) -> wire -> save through the Plans API (issue 02). Reuses
// node-kit's registry/KitNode/elkLayout, the existing ChannelConfigForm as the
// inspector's internals, ConfirmDialog for the detach-not-delete flow, and the
// existing i18n layer for every user-facing string. View-model logic (IR<->
// canvas projection, draft lifecycle, preset->param mapping, error anchoring)
// lives in lib/planCanvasModel.ts as framework-free functions with node --test
// coverage — this file only wires those pure functions to xyflow/React Query.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Save } from 'lucide-react'

import { createPlan, getPlan, updatePlan } from '../api/endpoints'
import type { PlanEdge, PlanNode } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorAlert from '../components/ErrorAlert'
import { PageLoader } from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import { ALL_NODES, nodeTypesForXyflow, registerNodes } from '../node-kit'
import { elkLayout } from '../node-kit/render/elkLayout'
import {
  anchorValidationErrors,
  canvasToPlanGraph,
  createDraftNodeFromPreset,
  createDraftSourceNode,
  deriveDraftAndRunnable,
  detachNode,
  extractPlanValidationErrors,
  fallbackPosition,
  materializeDraftNode,
  planGraphToCanvas,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
} from '../lib/planCanvasModel'
import { PlanCanvasInspector } from './PlanCanvasInspector'
import { PALETTE_DRAG_MIME, PlanCanvasPalette, parsePalettePayload, type PaletteDropPayload } from './PlanCanvasPalette'

const PLAN_IR_VERSION = '1.0.0'

registerNodes(ALL_NODES)

type FlowNode = Node<{ config: Record<string, unknown>; facts: Record<string, unknown> }>
type FlowEdge = Edge

function toFlowNode(n: CanvasNode, draft: boolean, errors: string[]): FlowNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      config: n.planNode.params,
      facts: { __draft: draft, __errors: errors },
    },
  }
}

function toFlowEdge(e: CanvasEdge): FlowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: 'default',
  }
}

function PlanCanvasInner() {
  const { t } = useTranslation()
  const { planId: routePlanId } = useParams<{ planId?: string }>()
  // The /plans/new route matches :planId literally as "new" — treat that (or
  // an absent param) as "no existing Plan to load", never as a real id.
  const planId = routePlanId && routePlanId !== 'new' ? routePlanId : undefined
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isNew = !planId

  const planQuery = useQuery({
    queryKey: ['plan-canvas', 'plan', planId],
    queryFn: () => getPlan(planId as string),
    enabled: Boolean(planId),
  })

  const [planName, setPlanName] = useState('')
  const [planNodes, setPlanNodes] = useState<PlanNode[]>([])
  const [planEdges, setPlanEdges] = useState<PlanEdge[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detachTarget, setDetachTarget] = useState<string | null>(null)
  const [errorsByNode, setErrorsByNode] = useState<Map<string, string[]>>(new Map())
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [laying, setLaying] = useState(false)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)

  const nodeTypes = useMemo(() => nodeTypesForXyflow(), [])

  // Load an existing Plan's graph onto the canvas (round-trip fidelity: the
  // same PlanGraph this page later saves is what a re-fetch reprojects).
  useEffect(() => {
    if (!planQuery.data) return
    setPlanName(planQuery.data.name)
    setPlanNodes(planQuery.data.graph.nodes)
    setPlanEdges(planQuery.data.graph.edges)
  }, [planQuery.data])

  useEffect(() => {
    if (isNew) {
      setPlanName(t('planCanvas.namePlaceholder'))
    }
  }, [isNew, t])

  const currentGraph: CanvasGraph = useMemo(
    () => planGraphToCanvas({ ir_version: PLAN_IR_VERSION, draft: false, nodes: planNodes, edges: planEdges }),
    [planNodes, planEdges],
  )

  // Sync the pure-model graph -> xyflow controlled state. Positions come from
  // whatever the operator last dragged to (preserved via rfNodes lookup),
  // falling back to the model's projected position for a brand-new node.
  useEffect(() => {
    setRfNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]))
      return currentGraph.nodes.map((n, index) => {
        const draft = n.planNode.kind === 'source' && n.planNode.draft === true && !n.planNode.source_id
        const errors = errorsByNode.get(n.id) ?? []
        const flow = toFlowNode(n, draft, errors)
        return { ...flow, position: posById.get(n.id) ?? n.position ?? fallbackPosition(index) }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGraph, errorsByNode])

  useEffect(() => {
    setRfEdges(currentGraph.edges.map(toFlowEdge))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGraph])

  const { draft: planDraftFlag, runnable: planRunnableFlag } = deriveDraftAndRunnable(planNodes)

  const selectedPlanNode = selectedId ? planNodes.find((n) => n.id === selectedId) ?? null : null

  const addNode = useCallback((node: PlanNode, position: { x: number; y: number }) => {
    setPlanNodes((prev) => [...prev, { ...node, params: { ...node.params, __canvas_position: position } }])
  }, [])

  const dropAt = useCallback(
    (payload: PaletteDropPayload, position: { x: number; y: number }) => {
      const id = `n-${Date.now()}-${seq.current++}`
      if (payload.kind === 'preset') {
        addNode(createDraftNodeFromPreset(payload.preset, position, id), position)
      } else if (payload.kind === 'draft-channel') {
        addNode(createDraftSourceNode(payload.channelType, position, id), position)
      } else {
        addNode(
          {
            id,
            kind: payload.nodeKind,
            type: payload.nodeKind,
            label: undefined,
            params: {},
            required_params: [],
            inputs: payload.nodeKind === 'merge' ? [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }] : [{ name: 'in', type: 'any' }],
            outputs: payload.nodeKind === 'sink' ? [] : [{ name: 'out', type: 'any' }],
            source_id: undefined,
            draft: false,
          },
          position,
        )
      }
    },
    [addNode],
  )

  const onPaletteClickPick = useCallback(
    (payload: PaletteDropPayload) => {
      const position = { x: 80 + (seq.current % 5) * 200, y: 60 + Math.floor(seq.current / 5) * 160 }
      dropAt(payload, position)
    },
    [dropAt],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      const id = `e-${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}`
      setPlanEdges((prev) => [
        ...prev,
        {
          id,
          source_node: params.source ?? '',
          source_port: params.sourceHandle ?? 'out',
          target_node: params.target ?? '',
          target_port: params.targetHandle ?? 'in',
        },
      ])
      setRfEdges((eds) => addEdge({ ...params, type: 'default' }, eds))
    },
    [setRfEdges],
  )

  const requestDetach = useCallback((nodeId: string) => setDetachTarget(nodeId), [])

  const confirmDetach = useCallback(() => {
    if (!detachTarget) return
    const next = detachNode(currentGraph, detachTarget)
    setPlanNodes(next.nodes.map((n) => n.planNode))
    setPlanEdges(next.edges.map((e) => e.planEdge))
    if (selectedId === detachTarget) setSelectedId(null)
    setDetachTarget(null)
  }, [detachTarget, currentGraph, selectedId])

  const updateSelectedParams = useCallback(
    (params: Record<string, unknown>) => {
      if (!selectedId) return
      setPlanNodes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, params } : n)))
    },
    [selectedId],
  )

  const materializeSelected = useCallback(
    (sourceId: string) => {
      if (!selectedId) return
      setPlanNodes((prev) =>
        prev.map((n) => {
          if (n.id !== selectedId) return n
          const materialized = materializeDraftNode(n, sourceId)
          return materialized
        }),
      )
    },
    [selectedId],
  )

  const saveMut = useMutation({
    mutationFn: async () => {
      const graphMeta = { irVersion: PLAN_IR_VERSION, name: planName, draft: planDraftFlag }
      const graph = canvasToPlanGraph(currentGraph, graphMeta)
      if (isNew) {
        return createPlan({ name: planName || t('planCanvas.namePlaceholder'), graph })
      }
      return updatePlan(planId as string, { name: planName, graph })
    },
    onSuccess: (saved) => {
      setErrorsByNode(new Map())
      qc.invalidateQueries({ queryKey: ['plan-canvas', 'plan'] })
      toast.success(t('planCanvas.saved'))
      if (isNew) navigate(`/plans/${saved.id}`, { replace: true })
    },
    onError: (err) => {
      const items = extractPlanValidationErrors(err)
      if (items.length > 0) {
        const anchored = anchorValidationErrors(items)
        const byNode = new Map<string, string[]>()
        for (const [nodeId, errs] of anchored.byNode) byNode.set(nodeId, errs.map((e) => e.message))
        setErrorsByNode(byNode)
        toast.error(t('planCanvas.validationFailed'))
      } else {
        toast.error(err instanceof Error ? err.message : t('planCanvas.saveFailed'))
      }
    },
  })

  const runAutoLayout = useCallback(async () => {
    if (rfNodes.length === 0) return
    setLaying(true)
    try {
      const laidOut = await elkLayout(rfNodes, rfEdges)
      setRfNodes(laidOut as FlowNode[])
      requestAnimationFrame(() => fitView({ padding: 0.16, duration: 400 }))
    } finally {
      setLaying(false)
    }
  }, [rfNodes, rfEdges, setRfNodes, fitView])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(PALETTE_DRAG_MIME)
      if (!raw) return
      e.preventDefault()
      const payload = parsePalettePayload(raw)
      if (!payload) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      dropAt(payload, position)
    },
    [dropAt, screenToFlowPosition],
  )

  if (planId && planQuery.isLoading) return <PageLoader />
  if (planId && planQuery.error) {
    return <ErrorAlert error={planQuery.error as Error} onRetry={() => planQuery.refetch()} />
  }

  const selectedErrors = selectedId ? errorsByNode.get(selectedId) ?? [] : []

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('planCanvas.title')}
        description={t('planCanvas.subtitle')}
        action={
          <div className="flex items-center gap-2">
            <input
              aria-label={t('planCanvas.nameLabel')}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder={t('planCanvas.namePlaceholder')}
              className="h-8 w-52 rounded-md border border-white/[0.12] bg-black/40 px-2.5 text-xs text-zinc-200 outline-none focus:border-primary-500/60"
            />
            {planDraftFlag && (
              <span className="rounded-sm border border-amber-400/35 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                {t('planCanvas.draftBadge')}
              </span>
            )}
            {planRunnableFlag && (
              <span className="rounded-sm border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                {t('planCanvas.runnableBadge')}
              </span>
            )}
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMut.isPending ? t('planCanvas.saving') : t('planCanvas.save')}
            </button>
          </div>
        }
      />

      <div className="relative flex h-[74vh] min-h-[560px] overflow-hidden rounded-md border border-white/[0.1] bg-black">
        <PlanCanvasPalette onPick={onPaletteClickPick} />

        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onNodesDelete={(deleted) => {
              for (const n of deleted) requestDetach(n.id)
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            minZoom={0.3}
            maxZoom={1.6}
            nodesDraggable
            nodesConnectable
            proOptions={{ hideAttribution: true }}
            className="bg-[#060608]"
          >
            <Background variant={BackgroundVariant.Dots} color="#2a2a32" gap={22} size={1.6} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap position="bottom-right" maskColor="rgba(6,6,8,0.78)" pannable zoomable />
            <Panel position="top-right">
              <button
                type="button"
                onClick={runAutoLayout}
                disabled={laying}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 shadow-lg transition hover:bg-sky-500/20 disabled:opacity-50"
              >
                {laying ? '…' : '自动布局'}
              </button>
            </Panel>
          </ReactFlow>
        </div>

        {selectedPlanNode && (
          <PlanCanvasInspector
            node={selectedPlanNode}
            errors={selectedErrors}
            onClose={() => setSelectedId(null)}
            onDetach={() => requestDetach(selectedPlanNode.id)}
            onMaterialized={materializeSelected}
            onParamsChange={updateSelectedParams}
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(detachTarget)}
        onOpenChange={(open) => {
          if (!open) setDetachTarget(null)
        }}
        title={t('planCanvas.detachConfirmTitle')}
        description={t('planCanvas.detachConfirmDescription')}
        confirmLabel={t('planCanvas.detachConfirmAction')}
        onConfirm={confirmDetach}
      />
    </div>
  )
}

export default function PlanCanvasPage() {
  return (
    <ReactFlowProvider>
      <PlanCanvasInner />
    </ReactFlowProvider>
  )
}
