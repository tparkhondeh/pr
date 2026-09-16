import { describe, expect, it } from 'vitest';
import { draftActionState, reconcileDraftEditor, type DraftActionInput } from '../apps/web/src/draft-action-state.js';
const base: DraftActionInput = { body: 'متن', savedBody: 'متن', status: 'approved', sourceAvailable: true, staleStrategy: false, mayRequestApproval: true, state: 'ready' };
describe('draft action safety', () => {
  it('requires exact saved text including whitespace for approval and export', () => {
    for (const status of ['approved', 'exported', 'awaiting_approval']) {
      expect(draftActionState({ ...base, status, body: 'متن ' })).toMatchObject({ dirty: true, canSave: true, canApprove: false, canExport: false });
    }
  });
  it('allows a valid current exported version to download again', () => {
    expect(draftActionState({ ...base, status: 'exported' }).canExport).toBe(true);
  });
  it('blocks all mutation controls when not ready', () => {
    for (const state of ['idle', 'loading', 'mutating', 'error']) {
      expect(draftActionState({ ...base, state, body: 'ویرایش' })).toMatchObject({ canSave: false, canApprove: false, canExport: false });
    }
  });
  it('blocks stale, revoked, conflicting or unsafe versions', () => {
    for (const patch of [{ staleStrategy: true }, { sourceAvailable: false }, { conflict: true }, { mayRequestApproval: false }]) {
      expect(draftActionState({ ...base, ...patch }).canExport).toBe(false);
    }
  });
  it('never silently overwrites an unsaved edit on refresh', () => {
    expect(reconcileDraftEditor({ body: 'ویرایش من', savedBody: 'متن', draftId: 'a', conflict: false }, { body: 'متن', draftId: 'a' })).toMatchObject({ body: 'ویرایش من', conflict: false });
  });
  it('keeps edits and requires explicit reconciliation after server changes', () => {
    expect(reconcileDraftEditor({ body: 'ویرایش من', savedBody: 'متن', draftId: 'a', conflict: false }, { body: 'نسخه دیگر', draftId: 'a' })).toMatchObject({ body: 'ویرایش من', conflict: true });
  });
  it('recognizes a successfully saved edit', () => {
    expect(reconcileDraftEditor({ body: 'ویرایش من', savedBody: 'متن', draftId: 'a', conflict: false }, { body: 'ویرایش من', draftId: 'a' })).toMatchObject({ body: 'ویرایش من', savedBody: 'ویرایش من', conflict: false });
  });
});
