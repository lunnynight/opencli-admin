import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  actionVerdict,
  toActionHistoryRowView,
  toListControlActionsParams,
  verdictTone,
  EMPTY_ACTION_HISTORY_FILTERS,
} from './actionHistory.ts'
import type { ControlActionRecord } from '../../api/types.ts'

function baseRow(overrides: Partial<ControlActionRecord> = {}): ControlActionRecord {
  return {
    id: 'row-1',
    source_id: 'src-1',
    run_id: null,
    measurement_id: null,
    mode: 'advisory',
    state: 'auth_failed',
    action_type: 'pause_source',
    reason: 'auth failing',
    payload: {},
    executed: false,
    evaluated_at: null,
    outcome: null,
    outcome_detail: null,
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    ...overrides,
  }
}

describe('actionVerdict', () => {
  it('reports pending when outcome is not yet judged', () => {
    assert.equal(actionVerdict(baseRow({ outcome: null })), 'pending')
  })

  it('reports the stored outcome once judged', () => {
    assert.equal(actionVerdict(baseRow({ outcome: 'recovered', evaluated_at: '2026-07-02T01:00:00Z' })), 'recovered')
    assert.equal(actionVerdict(baseRow({ outcome: 'persisted', evaluated_at: '2026-07-02T01:00:00Z' })), 'persisted')
    assert.equal(
      actionVerdict(baseRow({ outcome: 'insufficient_data', evaluated_at: '2026-07-02T01:00:00Z' })),
      'insufficient_data',
    )
  })
})

describe('verdictTone', () => {
  it('never paints pending as a positive or negative verdict', () => {
    assert.equal(verdictTone('pending'), 'neutral')
    assert.equal(verdictTone('insufficient_data'), 'neutral')
  })

  it('paints recovered success, persisted danger', () => {
    assert.equal(verdictTone('recovered'), 'success')
    assert.equal(verdictTone('persisted'), 'danger')
  })
})

describe('toActionHistoryRowView', () => {
  it('projects an advisory row with executed=false honestly', () => {
    const view = toActionHistoryRowView(baseRow())
    assert.equal(view.executed, false)
    assert.equal(view.mode, 'advisory')
    assert.equal(view.verdict, 'pending')
    assert.equal(view.verdictLabel, 'PENDING')
  })

  it('falls back to an em-dash when reason is null', () => {
    const view = toActionHistoryRowView(baseRow({ reason: null }))
    assert.equal(view.reason, '—')
  })

  it('projects an executed automatic row (future PR-Control-4 shape)', () => {
    const view = toActionHistoryRowView(
      baseRow({ mode: 'automatic', executed: true, outcome: 'recovered', evaluated_at: '2026-07-02T02:00:00Z' }),
    )
    assert.equal(view.executed, true)
    assert.equal(view.mode, 'automatic')
    assert.equal(view.verdict, 'recovered')
  })
})

describe('toListControlActionsParams', () => {
  it('omits empty filters entirely rather than sending empty-string params', () => {
    const params = toListControlActionsParams(EMPTY_ACTION_HISTORY_FILTERS, 1, 20)
    assert.deepEqual(params, { page: 1, limit: 20 })
  })

  it('includes only the filters that are set', () => {
    const params = toListControlActionsParams({ sourceId: 'src-1', mode: '', outcome: 'pending' }, 2, 10)
    assert.deepEqual(params, { source_id: 'src-1', outcome: 'pending', page: 2, limit: 10 })
  })

  it('includes all three filters when all are set', () => {
    const params = toListControlActionsParams(
      { sourceId: 'src-1', mode: 'automatic', outcome: 'recovered' },
      1,
      20,
    )
    assert.deepEqual(params, {
      source_id: 'src-1',
      mode: 'automatic',
      outcome: 'recovered',
      page: 1,
      limit: 20,
    })
  })
})
