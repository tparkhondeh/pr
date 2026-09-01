import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertAppendOnlyMigrations,
  defineMigration,
} from '../src/kernel/migrations.js';

const migrationPath = fileURLToPath(
  new URL('../db/migrations/0001_foundation.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');
const classificationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0002_assertion_data_class.sql', import.meta.url),
);
const classificationSql = readFileSync(classificationMigrationPath, 'utf8');
const strategyMigrationPath = fileURLToPath(
  new URL('../db/migrations/0003_strategy_loop.sql', import.meta.url),
);
const strategySql = readFileSync(strategyMigrationPath, 'utf8');
const claimMigrationPath = fileURLToPath(
  new URL('../db/migrations/0004_claim_registry.sql', import.meta.url),
);
const claimSql = readFileSync(claimMigrationPath, 'utf8');
const feedbackMigrationPath = fileURLToPath(
  new URL('../db/migrations/0005_feedback_learning.sql', import.meta.url),
);
const feedbackSql = readFileSync(feedbackMigrationPath, 'utf8');
const workbenchMigrationPath = fileURLToPath(
  new URL('../db/migrations/0006_workbench_state.sql', import.meta.url),
);
const workbenchSql = readFileSync(workbenchMigrationPath, 'utf8');
const conversationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0007_conversation_memory.sql', import.meta.url),
);
const conversationSql = readFileSync(conversationMigrationPath, 'utf8');
const memoryRightsMigrationPath = fileURLToPath(
  new URL('../db/migrations/0008_memory_rights.sql', import.meta.url),
);
const memoryRightsSql = readFileSync(memoryRightsMigrationPath, 'utf8');
const strategyContextMigrationPath = fileURLToPath(
  new URL('../db/migrations/0009_strategy_context.sql', import.meta.url),
);
const strategyContextSql = readFileSync(strategyContextMigrationPath, 'utf8');
const draftWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0010_draft_workspace.sql', import.meta.url),
);
const draftWorkspaceSql = readFileSync(draftWorkspaceMigrationPath, 'utf8');
const feedbackWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0011_feedback_workspace.sql', import.meta.url),
);
const feedbackWorkspaceSql = readFileSync(feedbackWorkspaceMigrationPath, 'utf8');
const textAssetMigrationPath = fileURLToPath(
  new URL('../db/migrations/0012_text_asset_intake.sql', import.meta.url),
);
const textAssetSql = readFileSync(textAssetMigrationPath, 'utf8');
const draftSourceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0013_draft_source_provenance.sql', import.meta.url),
);
const draftSourceSql = readFileSync(draftSourceMigrationPath, 'utf8');
const assetRightsMigrationPath = fileURLToPath(
  new URL('../db/migrations/0014_text_asset_rights.sql', import.meta.url),
);
const assetRightsSql = readFileSync(assetRightsMigrationPath, 'utf8');
const platformAdaptationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0015_platform_adaptation_profile.sql', import.meta.url),
);
const platformAdaptationSql = readFileSync(platformAdaptationMigrationPath, 'utf8');
const researchWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0016_research_workspace.sql', import.meta.url),
);
const researchWorkspaceSql = readFileSync(researchWorkspaceMigrationPath, 'utf8');
const claimReviewMigrationPath = fileURLToPath(
  new URL('../db/migrations/0017_claim_review_lifecycle.sql', import.meta.url),
);
const claimReviewSql = readFileSync(claimReviewMigrationPath, 'utf8');
const brandRiskReviewMigrationPath = fileURLToPath(
  new URL('../db/migrations/0018_brand_risk_reviews.sql', import.meta.url),
);
const brandRiskReviewSql = readFileSync(brandRiskReviewMigrationPath, 'utf8');
const conversationOrchestrationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0019_conversation_orchestration.sql', import.meta.url),
);
const conversationOrchestrationSql = readFileSync(conversationOrchestrationMigrationPath, 'utf8');
const arbitrationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0020_inter_module_arbitration.sql', import.meta.url),
);
const arbitrationSql = readFileSync(arbitrationMigrationPath, 'utf8');
const initiativeMigrationPath = fileURLToPath(
  new URL('../db/migrations/0021_proactive_initiative.sql', import.meta.url),
);
const initiativeSql = readFileSync(initiativeMigrationPath, 'utf8');
const relationshipMigrationPath = fileURLToPath(
  new URL('../db/migrations/0022_relationship_intelligence.sql', import.meta.url),
);
const relationshipSql = readFileSync(relationshipMigrationPath, 'utf8');
const perceptionMigrationPath = fileURLToPath(
  new URL('../db/migrations/0023_perception_engine.sql', import.meta.url),
);
const perceptionSql = readFileSync(perceptionMigrationPath, 'utf8');
const decisionContextMigrationPath = fileURLToPath(
  new URL('../db/migrations/0024_decision_context.sql', import.meta.url),
);
const decisionContextSql = readFileSync(decisionContextMigrationPath, 'utf8');
const strategicQualityMigrationPath = fileURLToPath(
  new URL('../db/migrations/0025_strategic_quality_baseline.sql', import.meta.url),
);
const strategicQualitySql = readFileSync(strategicQualityMigrationPath, 'utf8');
const strategicOutcomeMigrationPath = fileURLToPath(
  new URL('../db/migrations/0026_strategic_action_outcomes.sql', import.meta.url),
);
const strategicOutcomeSql = readFileSync(strategicOutcomeMigrationPath, 'utf8');
const workflowCostMigrationPath = fileURLToPath(
  new URL('../db/migrations/0027_workflow_cost_budget.sql', import.meta.url),
);
const workflowCostSql = readFileSync(workflowCostMigrationPath, 'utf8');
const modelInvocationJournalMigrationPath = fileURLToPath(
  new URL('../db/migrations/0028_model_invocation_journal.sql', import.meta.url),
);
const modelInvocationJournalSql = readFileSync(modelInvocationJournalMigrationPath, 'utf8');
const modelInputSafetyMigrationPath = fileURLToPath(
  new URL('../db/migrations/0029_model_input_safety.sql', import.meta.url),
);
const modelInputSafetySql = readFileSync(modelInputSafetyMigrationPath, 'utf8');
const modelInvocationReconciliationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0030_model_invocation_reconciliation.sql', import.meta.url),
);
const modelInvocationReconciliationSql = readFileSync(
  modelInvocationReconciliationMigrationPath,
  'utf8',
);

describe('foundation migration', () => {
  it('is transactional and receives a stable checksum', () => {
    const migration = defineMigration('0001_foundation', sql);
    expect(migration.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adds append-only, tenant-isolated human risk reviews without red override', () => {
    defineMigration('0018_brand_risk_reviews', brandRiskReviewSql);
    expect(brandRiskReviewSql).toContain('CREATE TABLE app.risk_reviews');
    expect(brandRiskReviewSql).toContain('ALTER TABLE app.risk_reviews FORCE ROW LEVEL SECURITY');
    expect(brandRiskReviewSql).toContain('CREATE POLICY risk_reviews_tenant_isolation');
    expect(brandRiskReviewSql).toContain("policy_version = 'brand-protection-v1'");
    expect(brandRiskReviewSql).toContain("expected_level = 'yellow' OR decision <> 'acknowledge'");
    expect(brandRiskReviewSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
  });

  it('adds a versioned orchestration contract without duplicating raw conversation text', () => {
    defineMigration('0019_conversation_orchestration', conversationOrchestrationSql);
    expect(conversationOrchestrationSql).toContain('orchestration_snapshot jsonb');
    expect(conversationOrchestrationSql).toContain('untrusted_user_input');
    expect(conversationOrchestrationSql).toContain('no_silent_cross_module_write');
    expect(conversationOrchestrationSql).toContain('orchestration_snapshot ?& ARRAY');
    expect(conversationOrchestrationSql).not.toContain("'userText'");
  });

  it('adds append-only, tenant-isolated inter-module arbitration with an execution ceiling', () => {
    defineMigration('0020_inter_module_arbitration', arbitrationSql);
    expect(arbitrationSql).toContain('CREATE TABLE app.arbitration_cases');
    expect(arbitrationSql).toContain('ALTER TABLE app.arbitration_cases FORCE ROW LEVEL SECURITY');
    expect(arbitrationSql).toContain('CREATE POLICY arbitration_cases_tenant_isolation');
    expect(arbitrationSql).toContain("policy_version = 'intermodule-arbitration-v1'");
    expect(arbitrationSql).toContain('requested_autonomy_level BETWEEN 0 AND 7');
    expect(arbitrationSql).toContain("executionPermitted' = 'false'");
    expect(arbitrationSql).toContain('effectiveAutonomyLevel');
    expect(arbitrationSql).toContain('BETWEEN 0 AND 5');
    expect(arbitrationSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
  });

  it('adds owner-controlled, rate-limited proactive initiative without execution authority', () => {
    defineMigration('0021_proactive_initiative', initiativeSql);
    for (const table of ['initiative_settings', 'initiative_setting_requests', 'initiative_evaluations']) {
      expect(initiativeSql).toContain(`CREATE TABLE app.${table}`);
      expect(initiativeSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(initiativeSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(initiativeSql).toContain("mode IN ('reactive', 'balanced', 'proactive')");
    expect(initiativeSql).toContain('max_prompts_per_24_hours BETWEEN 1 AND 3');
    expect(initiativeSql).toContain('minimum_relevance BETWEEN 0.5 AND 0.95');
    expect(initiativeSql).toContain("policy_version = 'initiative-policy-v1'");
    expect(initiativeSql).toContain("decision IN ('delivered', 'suppressed')");
    expect(initiativeSql).toContain('no outbound notification or action side effect');
  });

  it('adds private, tenant-isolated stakeholder context without contact automation', () => {
    defineMigration('0022_relationship_intelligence', relationshipSql);
    expect(relationshipSql).toContain(
      "ALTER TYPE app.consent_purpose ADD VALUE IF NOT EXISTS 'relationship_planning'",
    );
    for (const table of ['stakeholder_records', 'stakeholder_requests']) {
      expect(relationshipSql).toContain(`CREATE TABLE app.${table}`);
      expect(relationshipSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(relationshipSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(relationshipSql).toContain("operation IN ('create', 'delete')");
    expect(relationshipSql).toContain("relationship_boundary IN ('normal', 'ask_before_prompt', 'do_not_prompt')");
    expect(relationshipSql).toContain("result_snapshot = jsonb_build_object('stakeholderId'");
    expect(relationshipSql).toContain('no contact details, outbound contact, or automation authority');
  });

  it('adds private perception signals without source identity or automated collection', () => {
    defineMigration('0023_perception_engine', perceptionSql);
    expect(perceptionSql).toContain(
      "ALTER TYPE app.consent_purpose ADD VALUE IF NOT EXISTS 'perception_analysis'",
    );
    for (const table of ['perception_signals', 'perception_requests']) {
      expect(perceptionSql).toContain(`CREATE TABLE app.${table}`);
      expect(perceptionSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(perceptionSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(perceptionSql).toContain("perspective IN (\n    'self_perception', 'desired_positioning', 'external_perception'");
    expect(perceptionSql).toContain("result_snapshot = jsonb_build_object('signalId'");
    expect(perceptionSql).toContain('source identity, verbatim private quotes, automated collection');
  });

  it('adds an owner-controlled decision context and binds approval to its hash and window', () => {
    defineMigration('0024_decision_context', decisionContextSql);
    for (const table of ['decision_context_states', 'decision_context_requests']) {
      expect(decisionContextSql).toContain(`CREATE TABLE app.${table}`);
      expect(decisionContextSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(decisionContextSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(decisionContextSql).toContain('attention_capacity smallint NOT NULL');
    expect(decisionContextSql).toContain('ADD COLUMN approved_context_sha256 text');
    expect(decisionContextSql).toContain('ADD COLUMN decision_window_ends_at timestamptz');
    expect(decisionContextSql).toContain('workbench_approved_context_complete');
  });

  it('adds append-only, tenant-isolated reviews for a non-fabricated strategic baseline', () => {
    defineMigration('0025_strategic_quality_baseline', strategicQualitySql);
    for (const table of ['strategic_recommendation_reviews', 'strategic_review_requests']) {
      expect(strategicQualitySql).toContain(`CREATE TABLE app.${table}`);
      expect(strategicQualitySql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(strategicQualitySql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(strategicQualitySql).toContain("decision IN ('accepted', 'rejected', 'needs_revision')");
    expect(strategicQualitySql).toContain('usefulness BETWEEN 1 AND 5');
    expect(strategicQualitySql).toContain('decision_context_sha256');
    expect(strategicQualitySql).toContain('supersedes_review_id');
    expect(strategicQualitySql).toContain('Baselines remain provisional until the policy minimum sample size is reached');
  });

  it('adds append-only meaningful outcomes without turning engagement into identity', () => {
    defineMigration('0026_strategic_action_outcomes', strategicOutcomeSql);
    for (const table of ['strategic_action_outcomes', 'strategic_outcome_requests']) {
      expect(strategicOutcomeSql).toContain(`CREATE TABLE app.${table}`);
      expect(strategicOutcomeSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(strategicOutcomeSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(strategicOutcomeSql).toContain("execution_status IN ('completed', 'partial', 'not_executed')");
    expect(strategicOutcomeSql).toContain('satisfaction BETWEEN 1 AND 5');
    expect(strategicOutcomeSql).toContain('regret BETWEEN 1 AND 5');
    expect(strategicOutcomeSql).toContain('energy BETWEEN 1 AND 5');
    expect(strategicOutcomeSql).toContain('private_messages BETWEEN 0 AND 10000');
    expect(strategicOutcomeSql).toContain('Meaningful outcomes remain separate from identity');
  });

  it('adds a tenant-isolated preflight budget and truthful append-only cost ledger', () => {
    defineMigration('0027_workflow_cost_budget', workflowCostSql);
    for (const table of [
      'workflow_cost_budget_locks',
      'workflow_cost_reservations',
      'workflow_cost_charges',
    ]) {
      expect(workflowCostSql).toContain(`CREATE TABLE app.${table}`);
      expect(workflowCostSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(workflowCostSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(workflowCostSql).toContain("decision IN ('allowed', 'blocked')");
    expect(workflowCostSql).toContain("cost_evidence IN ('provider_reported', 'estimated', 'none')");
    expect(workflowCostSql).toContain("cost_evidence <> 'none' OR actual_cost_minor_units = 0");
    expect(workflowCostSql).toContain('actual_cost_minor_units =');
    expect(workflowCostSql).toContain('Unknown cost is stored as unmetered zero, never invented');
  });

  it('adds a tenant-isolated durable model invocation journal without raw model content', () => {
    defineMigration('0028_model_invocation_journal', modelInvocationJournalSql);
    expect(modelInvocationJournalSql).toContain('CREATE TABLE app.model_invocations');
    expect(modelInvocationJournalSql).toContain(
      'ALTER TABLE app.model_invocations FORCE ROW LEVEL SECURITY',
    );
    expect(modelInvocationJournalSql).toContain('CREATE POLICY model_invocations_tenant_isolation');
    expect(modelInvocationJournalSql).toContain("status IN (\n    'started', 'succeeded', 'cost_blocked'");
    expect(modelInvocationJournalSql).toContain('model invocation journal permits one terminal transition only');
    expect(modelInvocationJournalSql).toContain('raw prompt, input, and output content are intentionally excluded');
    expect(modelInvocationJournalSql).not.toMatch(/\b(prompt_text|input_text|output_text|raw_prompt|raw_output)\b/u);
  });

  it('adds truthful immutable input-safety provenance without rewriting historical rows', () => {
    defineMigration('0029_model_input_safety', modelInputSafetySql);
    expect(modelInputSafetySql).toContain('ADD COLUMN input_safety_policy_version text');
    expect(modelInputSafetySql).toContain("input_safety_policy_version = 'model-input-safety-v1'");
    expect(modelInputSafetySql).toContain('NULL means a historical invocation predates this gate');
    expect(modelInputSafetySql).toContain(
      'NEW.input_safety_policy_version IS DISTINCT FROM OLD.input_safety_policy_version',
    );
    expect(modelInputSafetySql).not.toContain('UPDATE app.model_invocations');
  });

  it('adds hash-only human reconciliation states without permitting automatic retry', () => {
    defineMigration('0030_model_invocation_reconciliation', modelInvocationReconciliationSql);
    expect(modelInvocationReconciliationSql).toContain(
      'ADD COLUMN reconciliation_policy_version text',
    );
    expect(modelInvocationReconciliationSql).toContain(
      'ADD COLUMN reconciliation_evidence_sha256 text',
    );
    expect(modelInvocationReconciliationSql).toContain("'reconciled_not_executed'");
    expect(modelInvocationReconciliationSql).toContain(
      "'reconciled_billed_output_unavailable'",
    );
    expect(modelInvocationReconciliationSql).toContain(
      "cost_evidence = 'provider_reported' AND output_sha256 IS NULL",
    );
    expect(modelInvocationReconciliationSql).toContain(
      "position('reservation_id' IN pg_get_constraintdef(constraint_definition.oid)) > 0",
    );
    expect(modelInvocationReconciliationSql).not.toMatch(
      /DROP CONSTRAINT model_invocations_check\d+/,
    );
    expect(modelInvocationReconciliationSql).toContain(
      'Raw evidence is intentionally excluded',
    );
    expect(modelInvocationReconciliationSql).not.toMatch(
      /\b(raw_evidence|evidence_text|provider_response|output_text)\b/u,
    );
  });

  it('defines the required tenant-owned tables', () => {
    for (const table of [
      'memberships',
      'assets',
      'evidence_items',
      'assertions',
      'assertion_evidence',
      'consent_grants',
      'audit_events',
      'outbox_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE app.${table}`);
      expect(sql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('makes audit events append-only', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON app.audit_events');
    expect(sql).toContain("RAISE EXCEPTION 'audit events are append-only'");
  });

  it('rejects edits to an applied migration', () => {
    const migration = defineMigration('0001_foundation', sql);
    expect(() => {
      assertAppendOnlyMigrations(
        new Map([[migration.id, '0'.repeat(64)]]),
        [migration],
      );
    }).toThrow('Applied migration changed');
  });

  it('adds assertion classification in an append-only migration', () => {
    const migration = defineMigration(
      '0002_assertion_data_class',
      classificationSql,
    );
    expect(migration.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(classificationSql).toContain(
      "ADD COLUMN data_class app.data_class NOT NULL DEFAULT 'confidential'",
    );
  });

  it('adds tenant-isolated strategy tables', () => {
    defineMigration('0003_strategy_loop', strategySql);
    for (const table of [
      'goals',
      'positioning_snapshots',
      'action_recommendations',
      'action_options',
    ]) {
      expect(strategySql).toContain(`CREATE TABLE app.${table}`);
      expect(strategySql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(strategySql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated claim and draft tables', () => {
    defineMigration('0004_claim_registry', claimSql);
    for (const table of ['claims', 'claim_evidence', 'draft_artifacts', 'draft_claims']) {
      expect(claimSql).toContain(`CREATE TABLE app.${table}`);
      expect(claimSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(claimSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated feedback learning tables', () => {
    defineMigration('0005_feedback_learning', feedbackSql);
    for (const table of ['feedback_events', 'preference_proposals']) {
      expect(feedbackSql).toContain(`CREATE TABLE app.${table}`);
      expect(feedbackSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(feedbackSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated, optimistic workbench state', () => {
    defineMigration('0006_workbench_state', workbenchSql);
    expect(workbenchSql).toContain('CREATE TABLE app.workbench_states');
    expect(workbenchSql).toContain(
      'ALTER TABLE app.workbench_states FORCE ROW LEVEL SECURITY',
    );
    expect(workbenchSql).toContain('CREATE POLICY workbench_states_tenant_isolation');
    expect(workbenchSql).toContain('revision bigint NOT NULL');
    expect(workbenchSql).toContain(
      "status NOT IN ('approved', 'running', 'completed', 'failed')",
    );
  });

  it('adds tenant-isolated conversation and consent-first memory staging', () => {
    defineMigration('0007_conversation_memory', conversationSql);
    for (const table of [
      'conversation_threads',
      'conversation_turns',
      'memory_proposals',
    ]) {
      expect(conversationSql).toContain(`CREATE TABLE app.${table}`);
      expect(conversationSql).toContain(
        `ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(conversationSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(conversationSql).toContain("status = 'confirmed' AND permissions IS NOT NULL");
    expect(conversationSql).toContain('content_sha256 text NOT NULL');
  });

  it('adds auditable, idempotent and tenant-isolated memory rights', () => {
    defineMigration('0008_memory_rights', memoryRightsSql);
    expect(memoryRightsSql).toContain('CREATE TABLE app.memory_rights_requests');
    expect(memoryRightsSql).toContain(
      'ALTER TABLE app.memory_rights_requests FORCE ROW LEVEL SECURITY',
    );
    expect(memoryRightsSql).toContain(
      'CREATE POLICY memory_rights_requests_tenant_isolation',
    );
    expect(memoryRightsSql).toContain("operation IN ('correct', 'contest', 'delete', 'revoke')");
    expect(memoryRightsSql).toContain('UNIQUE (tenant_id, subject_user_id, client_ref)');
    expect(memoryRightsSql).toContain('active_assertion_id uuid');
    expect(memoryRightsSql).toContain('deleted_at timestamptz');
    expect(memoryRightsSql).toContain('resource_type text');
    expect(memoryRightsSql).toContain('revoked_legacy_memory_consent');
    expect(memoryRightsSql).toContain("'consent.scope_migrated'");
    expect(memoryRightsSql.indexOf('SET active_assertion_id = assertion_id')).toBeLessThan(
      memoryRightsSql.indexOf('memory_proposals_confirmed_active_assertion'),
    );
  });

  it('adds versioned owner strategy context and binds approvals to its revision', () => {
    defineMigration('0009_strategy_context', strategyContextSql);
    for (const table of ['strategy_context_states', 'strategy_context_requests']) {
      expect(strategyContextSql).toContain(`CREATE TABLE app.${table}`);
      expect(strategyContextSql).toContain(
        `ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(strategyContextSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(strategyContextSql).toContain('current_goal_id uuid NOT NULL');
    expect(strategyContextSql).toContain('current_positioning_id uuid NOT NULL');
    expect(strategyContextSql).toContain('result_snapshot jsonb');
    expect(strategyContextSql).toContain('ADD COLUMN strategy_revision bigint NOT NULL');
  });

  it('adds an auditable and idempotent owner draft workspace', () => {
    defineMigration('0010_draft_workspace', draftWorkspaceSql);
    expect(draftWorkspaceSql).toContain('CREATE TABLE app.draft_workspace_requests');
    expect(draftWorkspaceSql).toContain(
      'ALTER TABLE app.draft_workspace_requests FORCE ROW LEVEL SECURITY',
    );
    expect(draftWorkspaceSql).toContain('ADD COLUMN source_assertion_id uuid');
    expect(draftWorkspaceSql).toContain('ADD COLUMN strategy_revision bigint');
    expect(draftWorkspaceSql).toContain('ADD COLUMN revision bigint NOT NULL DEFAULT 1');
    expect(draftWorkspaceSql).toContain("operation IN ('create', 'edit', 'approve', 'export')");
  });

  it('adds idempotent tenant-isolated feedback requests and active preference protection', () => {
    defineMigration('0011_feedback_workspace', feedbackWorkspaceSql);
    expect(feedbackWorkspaceSql).toContain('CREATE TABLE app.feedback_learning_requests');
    expect(feedbackWorkspaceSql).toContain(
      'ALTER TABLE app.feedback_learning_requests FORCE ROW LEVEL SECURITY',
    );
    expect(feedbackWorkspaceSql).toContain('CREATE POLICY feedback_learning_requests_tenant_isolation');
    expect(feedbackWorkspaceSql).toContain("operation IN ('edited', 'rejected', 'decide')");
    expect(feedbackWorkspaceSql).toContain('preference_proposals_one_active_value_idx');
  });

  it('adds idempotent tenant-isolated text asset intake requests', () => {
    defineMigration('0012_text_asset_intake', textAssetSql);
    expect(textAssetSql).toContain('CREATE TABLE app.asset_intake_requests');
    expect(textAssetSql).toContain(
      'ALTER TABLE app.asset_intake_requests FORCE ROW LEVEL SECURITY',
    );
    expect(textAssetSql).toContain('CREATE POLICY asset_intake_requests_tenant_isolation');
    expect(textAssetSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(textAssetSql).toContain('request_sha256 text NOT NULL');
    expect(textAssetSql).toContain('result_snapshot jsonb NOT NULL');
  });

  it('records whether a draft source is memory or a text asset', () => {
    defineMigration('0013_draft_source_provenance', draftSourceSql);
    expect(draftSourceSql).toContain('ADD COLUMN source_kind text NOT NULL');
    expect(draftSourceSql).toContain("source_kind IN ('memory', 'text_asset')");
    expect(draftSourceSql).toContain('ADD COLUMN approved_evidence_ids text[] NOT NULL');
    expect(draftSourceSql).toContain('CREATE INDEX draft_artifacts_source_idx');
  });

  it('adds idempotent tenant-isolated text asset rights requests', () => {
    defineMigration('0014_text_asset_rights', assetRightsSql);
    expect(assetRightsSql).toContain('CREATE TABLE app.asset_rights_requests');
    expect(assetRightsSql).toContain("operation IN ('revoke_brand_usage', 'delete')");
    expect(assetRightsSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(assetRightsSql).toContain('ALTER TABLE app.asset_rights_requests FORCE ROW LEVEL SECURITY');
    expect(assetRightsSql).toContain('CREATE POLICY asset_rights_requests_tenant_isolation');
  });

  it('freezes the platform adaptation contract used by each draft', () => {
    defineMigration('0015_platform_adaptation_profile', platformAdaptationSql);
    expect(platformAdaptationSql).toContain('ADD COLUMN adaptation_profile_version text NOT NULL');
    expect(platformAdaptationSql).toContain("adaptation_profile_version = 'platform-adaptation-v1'");
  });

  it('keeps external research in a dedicated tenant-isolated workspace', () => {
    defineMigration('0016_research_workspace', researchWorkspaceSql);
    expect(researchWorkspaceSql).toContain('CREATE TABLE app.research_sources');
    expect(researchWorkspaceSql).toContain("quality IN ('primary', 'authoritative_secondary', 'secondary', 'unverified')");
    expect(researchWorkspaceSql).toContain("stance IN ('supports', 'contradicts')");
    expect(researchWorkspaceSql).toContain('ALTER TABLE app.research_sources FORCE ROW LEVEL SECURITY');
    expect(researchWorkspaceSql).toContain('CREATE POLICY research_sources_tenant_isolation');
  });

  it('adds an append-only, tenant-isolated human claim review lifecycle', () => {
    defineMigration('0017_claim_review_lifecycle', claimReviewSql);
    expect(claimReviewSql).toContain('CREATE TABLE app.claim_reviews');
    expect(claimReviewSql).toContain("decision IN ('verify', 'dispute', 'revoke')");
    expect(claimReviewSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(claimReviewSql).toContain('trace_snapshot jsonb NOT NULL');
    expect(claimReviewSql).toContain('ALTER TABLE app.claim_reviews FORCE ROW LEVEL SECURITY');
    expect(claimReviewSql).toContain('CREATE POLICY claim_reviews_tenant_isolation');
  });
});
