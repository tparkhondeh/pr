import { describe, expect, it } from 'vitest';

interface PreviewWorker {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }): Promise<Response>;
}

describe('private preview worker draft runtime', () => {
  it('runs the evidence-bound export flow and blocks replay after consent revocation', async () => {
    const moduleUrl = new URL('../apps/web/public/server/index.js', import.meta.url);
    const workerModule = await import(moduleUrl.href) as { default: PreviewWorker };
    const worker = workerModule.default;
    const env = {
      ASSETS: {
        fetch: () => Promise.resolve(new Response('not found', { status: 404 })),
      },
    };
    const post = async (path: string, body: unknown) => worker.fetch(
      new Request(`https://preview.example${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );

    const turn = await post('/api/conversations/turns', {
      conversationId: 'conversation_runtime',
      turnId: 'turn_runtime',
      text: 'در یک پروژه واقعی، ابهام را با گفت‌وگوی مستقیم به تصمیم قابل اجرا تبدیل کردم.',
      proposeMemory: true,
    });
    expect(turn.status).toBe(200);
    const proposalId = 'memory_turn_runtime';

    expect((await post(`/api/memory/proposals/${proposalId}/confirm`, {
      permissions: {
        personalUnderstanding: true,
        brandUsage: false,
        publicUsage: false,
      },
    })).status).toBe(200);
    expect((await post('/api/workbench/approval', { actionId: 'essay' })).status).toBe(200);

    const createRequest = {
      requestId: 'draft_runtime_create',
      sourceProposalId: proposalId,
      channel: 'linkedin',
      narrativeAngle: 'وقتی شفافیت از نمایش قطعیت مهم‌تر است و تصمیم مسئولانه می‌سازد',
      takeaway: 'گفت‌وگوی مستقیم می‌تواند ابهام را به یک تصمیم مسئولانه تبدیل کند. '.repeat(20),
      publicDraftingConsent: true,
    };
    const createdResponse = await post('/api/drafts', createRequest);
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as {
      draftId: string;
      revision: number;
      status: string;
    };
    expect(created.status).toBe('awaiting_approval');

    let edited = created;
    const statement = 'در یک پروژه واقعی، ابهام را با گفت‌وگوی مستقیم به تصمیم قابل اجرا تبدیل کردم.';
    for (const [index, repeat] of [32, 20, 11].entries()) {
      const editedResponse = await worker.fetch(
        new Request(`https://preview.example/api/drafts/${created.draftId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requestId: `draft_runtime_edit_${String(index)}`,
            expectedRevision: edited.revision,
            body: `تیتر کوتاه\n\n${statement}\n\n${'برداشت روشن و صادقانه. '.repeat(repeat)}`,
          }),
        }),
        env,
      );
      expect(editedResponse.status).toBe(200);
      edited = await editedResponse.json() as typeof created;
    }
    const feedbackResponse = await worker.fetch(new Request('https://preview.example/api/feedback'), env);
    const feedback = await feedbackResponse.json() as {
      summary: { proposed: number };
      preferences: Array<{ id: string; preferenceKey: string }>;
    };
    expect(feedback.summary.proposed).toBeGreaterThan(0);
    const preference = feedback.preferences.find((item) => item.preferenceKey === 'voice.draft_length');
    if (!preference) throw new Error('Expected preview preference proposal.');
    expect((await post(`/api/feedback/preferences/${preference.id}/decision`, {
      requestId: 'preference_runtime_apply',
      decision: 'applied',
    })).status).toBe(200);

    const approvedResponse = await post(`/api/drafts/${created.draftId}/approve`, {
      requestId: 'draft_runtime_approve',
      expectedRevision: edited.revision,
    });
    const approved = await approvedResponse.json() as { revision: number; status: string };
    expect(approvedResponse.status).toBe(200);
    expect(approved.status).toBe('approved');

    const exportRequest = {
      requestId: 'draft_runtime_export',
      expectedRevision: approved.revision,
    };
    const exportedResponse = await post(`/api/drafts/${created.draftId}/export`, exportRequest);
    expect(exportedResponse.status).toBe(200);
    const exported = await exportedResponse.json() as { filename: string; content: string };
    expect(exported.filename).toMatch(/^pr-linkedin-draft-v\d+\.txt$/);
    expect(exported.content).toContain('در یک پروژه واقعی');

    expect((await post(`/api/memory/proposals/${proposalId}/rights`, {
      requestId: 'memory_runtime_revoke',
      operation: 'revoke',
      reason: 'دیگر اجازه استفاده عمومی از این منبع را نمی‌دهم.',
    })).status).toBe(200);

    const replayedCreate = await post('/api/drafts', createRequest);
    expect(replayedCreate.status).toBe(409);
    expect(await replayedCreate.json()).toEqual({ error: 'source_not_available' });

    const replayedExport = await post(`/api/drafts/${created.draftId}/export`, exportRequest);
    expect(replayedExport.status).toBe(409);
    expect(await replayedExport.json()).toEqual({ error: 'source_not_available' });
  });
});
