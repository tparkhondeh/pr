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

    const coldWorkbench = await worker.fetch(
      new Request('https://preview.example/api/workbench'),
      env,
    );
    const coldSnapshot = await coldWorkbench.json() as {
      evidence: { state: string; strategyEvidenceCount: number };
      actions: Array<{ id: string; interaction: string }>;
    };
    expect(coldSnapshot.evidence).toMatchObject({ state: 'insufficient', strategyEvidenceCount: 0 });
    expect(coldSnapshot.actions[0]).toMatchObject({
      id: 'collect_evidence', interaction: 'open_intake',
    });
    const routedApproval = await post('/api/workbench/approval', { actionId: 'collect_evidence' });
    expect(routedApproval.status).toBe(409);
    await expect(routedApproval.json()).resolves.toEqual({ error: 'action_not_approvable' });

    const researchStatement = 'شفافیت تصمیم می‌تواند اعتماد سازمانی را حفظ کند.';
    const researchBase = {
      publisher: 'مرکز پژوهش نمونه',
      excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را بررسی می‌کند.',
      statement: researchStatement,
      quality: 'primary',
      publishedAt: '2026-08-01T00:00:00.000Z',
      maxAgeDays: 90,
    };
    expect((await post('/api/research/sources', {
      ...researchBase,
      requestId: 'research_runtime_support',
      title: 'گزارش رسمی درباره اعتماد سازمانی',
      url: 'https://research.example.org/report',
      stance: 'supports',
    })).status).toBe(201);
    expect((await post('/api/research/sources', {
      ...researchBase,
      requestId: 'research_runtime_contradict',
      title: 'نقد روش‌شناسی گزارش اعتماد',
      url: 'https://review.example.org/critique',
      stance: 'contradicts',
    })).status).toBe(201);
    const researchResponse = await worker.fetch(
      new Request('https://preview.example/api/research'),
      env,
    );
    await expect(researchResponse.json()).resolves.toMatchObject({
      persistence: 'ephemeral',
      summary: { totalSources: 2, conflicts: 1, citationReady: 0 },
      sources: [
        { factCheckStatus: 'conflicted', usableForPublicClaim: false },
        { factCheckStatus: 'conflicted', usableForPublicClaim: false },
      ],
    });
    const claimsBeforeResponse = await worker.fetch(
      new Request('https://preview.example/api/claims'),
      env,
    );
    const claimsBefore = await claimsBeforeResponse.json() as {
      summary: { totalClaims: number; traceBlocked: number };
      claims: Array<{ claimId: string; status: string; traceStatus: string }>;
    };
    expect(claimsBefore.summary).toMatchObject({ totalClaims: 2, traceBlocked: 2 });
    const conflictedClaim = claimsBefore.claims[0];
    if (!conflictedClaim) throw new Error('Expected a conflicted claim.');
    const blockedVerification = await post(`/api/claims/${conflictedClaim.claimId}/reviews`, {
      requestId: 'claim_runtime_verify_blocked',
      expectedStatus: 'proposed',
      decision: 'verify',
      rationale: 'این Review باید به‌دلیل تعارض دو Source از Verify خودکار جلوگیری کند.',
      humanAttestation: true,
    });
    expect(blockedVerification.status).toBe(422);
    await expect(blockedVerification.json()).resolves.toEqual({ error: 'trace_incomplete' });
    expect((await post(`/api/claims/${conflictedClaim.claimId}/reviews`, {
      requestId: 'claim_runtime_dispute',
      expectedStatus: 'proposed',
      decision: 'dispute',
      rationale: 'این Claim تا حل تعارض منابع نباید وارد هیچ خروجی عمومی شود.',
      humanAttestation: false,
    })).status).toBe(201);

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
        brandUsage: true,
        publicUsage: false,
      },
    })).status).toBe(200);
    const approvedAssetResponse = await post('/api/assets/text', {
      requestId: 'asset_runtime_brand_basis',
      title: 'مبنای واقعی تحلیل برند',
      content: 'در یک تجربه واقعی، گفت‌وگوی مستقیم باعث شد ابهام به تصمیمی مسئولانه و قابل اجرا تبدیل شود.',
      assertionText: 'گفت‌وگوی مستقیم را ابزاری برای تبدیل ابهام به تصمیم مسئولانه می‌دانم.',
      occurredAt: '2026-08-19T12:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    expect(approvedAssetResponse.status).toBe(201);
    const approvedAsset = await approvedAssetResponse.json() as {
      record: { assetId: string; evidenceId: string };
    };
    expect((await post('/api/workbench/approval', { actionId: 'essay' })).status).toBe(200);

    const approvedWorkbench = await worker.fetch(
      new Request('https://preview.example/api/workbench'),
      env,
    );
    const approvedSnapshot = await approvedWorkbench.json() as {
      workflow: { approvedEvidenceIds: string[] };
    };
    expect(approvedSnapshot.workflow.approvedEvidenceIds).toEqual(expect.arrayContaining([
      'evidence_turn_runtime',
      approvedAsset.record.evidenceId,
    ]));

    const lateAssetResponse = await post('/api/assets/text', {
      requestId: 'asset_runtime_after_approval',
      title: 'منبع جدید پس از تأیید',
      content: 'این منبع پس از تأیید اقدام اضافه شده و نباید بدون تأیید دوباره وارد همان Draft شود.',
      assertionText: 'این منبع پس از تأیید اقدام ثبت شده است.',
      occurredAt: '2026-08-19T13:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    expect(lateAssetResponse.status).toBe(201);
    const lateAsset = await lateAssetResponse.json() as {
      record: { assetId: string; evidenceId: string };
    };
    const lateSourcesResponse = await worker.fetch(
      new Request('https://preview.example/api/drafts/sources'),
      env,
    );
    const lateSources = await lateSourcesResponse.json() as {
      records: Array<{ ref: string }>;
    };
    expect(lateSources.records.some((source) => source.ref === lateAsset.record.assetId)).toBe(true);
    expect(approvedSnapshot.workflow.approvedEvidenceIds).not.toContain(lateAsset.record.evidenceId);
    const lateSourceDraft = await post('/api/drafts', {
      requestId: 'draft_runtime_late_source',
      sourceKind: 'text_asset',
      sourceRef: lateAsset.record.assetId,
      channel: 'linkedin',
      narrativeAngle: 'منبع جدید باید تأیید تازه داشته باشد',
      takeaway: 'Evidence جدید به تأیید قبلی سرایت نمی‌کند.',
      publicDraftingConsent: true,
    });
    expect(lateSourceDraft.status).toBe(409);
    await expect(lateSourceDraft.json()).resolves.toEqual({
      error: 'source_not_authorized_for_action',
    });

    const createRequest = {
      requestId: 'draft_runtime_create',
      sourceKind: 'memory',
      sourceRef: proposalId,
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
      adaptation: { version: string; hardMaximumCharacters: number; currentCharacters: number };
    };
    expect(created.status).toBe('awaiting_approval');
    expect(created.adaptation).toMatchObject({
      version: 'platform-adaptation-v1',
      hardMaximumCharacters: 3000,
    });

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
            body: `تیتر کوتاه\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${'برداشت روشن و صادقانه. '.repeat(repeat)}`,
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

    const activityResponse = await worker.fetch(
      new Request('https://preview.example/api/account/activity'),
      env,
    );
    const activity = await activityResponse.json() as {
      summary: { total: number; dataRights: number; exports: number };
      events: Array<{ eventType: string }>;
    };
    expect(activityResponse.status).toBe(200);
    expect(activity.summary.total).toBeGreaterThanOrEqual(9);
    expect(activity.summary.dataRights).toBeGreaterThanOrEqual(3);
    expect(activity.events.some((event) => event.eventType === 'draft.exported')).toBe(true);

    const assetRequest = {
      requestId: 'asset_runtime_note',
      title: 'یادداشت تصمیم واقعی',
      content: 'در یک تصمیم واقعی، بیان محدودیت‌ها کمک کرد اعتماد تیم و کیفیت تصمیم حفظ شود.',
      assertionText: 'من شفافیت درباره محدودیت‌ها را بخشی از تصمیم‌گیری مسئولانه می‌دانم.',
      occurredAt: '2026-08-20T12:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: false },
    };
    const assetResponse = await post('/api/assets/text', assetRequest);
    expect(assetResponse.status).toBe(201);
    const privateAsset = await assetResponse.json() as {
      record: { assetId: string; sourceType: string; dataClass: string };
    };
    expect(privateAsset).toMatchObject({
      outcome: 'applied',
      record: { sourceType: 'text_asset', dataClass: 'confidential' },
    });
    const repeatedAsset = await post('/api/assets/text', assetRequest);
    expect(repeatedAsset.status).toBe(200);
    await expect(repeatedAsset.json()).resolves.toMatchObject({ outcome: 'already_applied' });
    const revokedAsset = await post(`/api/assets/text/${approvedAsset.record.assetId}/rights`, {
      requestId: 'asset_runtime_revoke_brand',
      operation: 'revoke_brand_usage',
      reason: 'این منبع دیگر برای تحلیل برند استفاده نشود.',
    });
    expect(revokedAsset.status).toBe(200);
    await expect(revokedAsset.json()).resolves.toMatchObject({
      operation: 'revoke_brand_usage', brandUsage: false, deleted: false,
    });
    const deletedAsset = await post(`/api/assets/text/${privateAsset.record.assetId}/rights`, {
      requestId: 'asset_runtime_delete',
      operation: 'delete',
      reason: 'این منبع خصوصی حذف شود.',
    });
    expect(deletedAsset.status).toBe(200);
    await expect(deletedAsset.json()).resolves.toMatchObject({ deleted: true });
    const replayedDeletedAsset = await post('/api/assets/text', assetRequest);
    expect(replayedDeletedAsset.status).toBe(409);
    await expect(replayedDeletedAsset.json()).resolves.toEqual({ error: 'asset_import_conflict' });
    const onboardingResponse = await worker.fetch(
      new Request('https://preview.example/api/onboarding'),
      env,
    );
    await expect(onboardingResponse.json()).resolves.toMatchObject({
      modelMaturity: { evidenceCount: 2, components: { exercisedDataControl: 10 } },
      strategyReadiness: { ready: true, evidenceCount: 1, withheldEvidenceCount: 1 },
      assets: { summary: { assets: 2, evidenceItems: 2, assertions: 2, dataRights: 2 } },
    });

    const accountExportResponse = await worker.fetch(
      new Request('https://preview.example/api/account/export'),
      env,
    );
    const accountExport = await accountExportResponse.json() as {
      schemaVersion: number;
      scope: string;
      data: {
        memory: { records: Array<{ consent: { personalUnderstanding: boolean } }> };
        assets: { records: Array<{ sourceType: string }> };
        research: { summary: { conflicts: number }; sources: unknown[] };
        claims: { summary: { disputedOrRevoked: number }; claims: unknown[] };
      };
    };
    expect(accountExportResponse.status).toBe(200);
    expect(accountExport).toMatchObject({ schemaVersion: 1, scope: 'owner_portable_data' });
    expect(accountExport.data.memory.records[0]?.consent.personalUnderstanding).toBe(false);
    expect(accountExport.data.assets.records[0]?.sourceType).toBe('text_asset');
    expect(accountExport.data.research).toMatchObject({ summary: { conflicts: 1 } });
    expect(accountExport.data.research.sources).toHaveLength(2);
    expect(accountExport.data.claims.summary.disputedOrRevoked).toBe(1);
    expect(accountExport.data.claims.claims.length).toBeGreaterThanOrEqual(3);

    const activityAfterExport = await worker.fetch(
      new Request('https://preview.example/api/account/activity'),
      env,
    );
    await expect(activityAfterExport.json()).resolves.toMatchObject({
      summary: { exports: 2 },
    });
  });
});
