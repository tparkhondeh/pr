export type DraftActionInput = Readonly<{
  body: string; savedBody: string; status: string; sourceAvailable: boolean;
  staleStrategy: boolean; mayRequestApproval: boolean; state: string; conflict?: boolean;
}>;

export function draftActionState(input: DraftActionInput) {
  const dirty = input.body !== input.savedBody;
  const ready = input.state === 'ready' && !input.conflict;
  const valid = ready && !dirty && input.sourceAvailable && !input.staleStrategy && input.mayRequestApproval;
  return {
    dirty,
    canSave: ready && dirty && input.body.trim().length > 0,
    canApprove: valid && input.status === 'awaiting_approval',
    canExport: valid && (input.status === 'approved' || input.status === 'exported'),
  };
}

export type DraftEditorState = Readonly<{ body: string; savedBody: string; draftId: string; conflict: boolean }>;
export function reconcileDraftEditor(current: DraftEditorState, incoming: Readonly<{ body: string; draftId: string }>): DraftEditorState {
  const dirty = current.body !== current.savedBody;
  if (!dirty || (current.draftId === incoming.draftId && current.body === incoming.body)) {
    return { body: incoming.body, savedBody: incoming.body, draftId: incoming.draftId, conflict: false };
  }
  return { ...current, savedBody: incoming.body, draftId: incoming.draftId,
    conflict: current.conflict || current.draftId !== incoming.draftId || current.savedBody !== incoming.body };
}
