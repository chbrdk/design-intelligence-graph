/** Closed dig:flow.* labels for Library Flows filter (from catalog). */

import catalog from '../../../knowledge/flow-actions-catalog.json'

export interface FlowActionOption {
  id: string
  label: string
}

export function listFlowActionFilterOptions(): FlowActionOption[] {
  const actions = (catalog as { actions?: Array<{ id: string; label: string }> }).actions ?? []
  return actions
    .filter((action) => action.id !== 'dig:flow.unknown')
    .map((action) => ({ id: action.id, label: action.label }))
}

export function labelForFlowAction(id: string): string {
  return listFlowActionFilterOptions().find((action) => action.id === id)?.label ?? id.replace(/^dig:flow\./, '')
}
