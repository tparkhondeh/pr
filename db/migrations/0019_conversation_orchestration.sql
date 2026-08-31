BEGIN;

ALTER TABLE app.conversation_turns
  ADD COLUMN orchestration_snapshot jsonb;

UPDATE app.conversation_turns
   SET orchestration_snapshot = jsonb_build_object(
     'policyVersion', 'legacy-conversation-intake',
     'intent', jsonb_build_object(
       'kind', 'unclear',
       'confidence', 0,
       'rationale', 'Turn predates the versioned conversation orchestrator.'
     ),
     'route', jsonb_build_object(
       'module', 'conversation',
       'mode', 'clarify',
       'targetView', 'today',
       'readAuthority', 'none',
       'writeAuthority', CASE WHEN propose_memory THEN 'propose_only' ELSE 'none' END,
       'requiresUserApproval', propose_memory
     ),
     'provenance', jsonb_build_object(
       'sources', jsonb_build_array(jsonb_build_object(
         'kind', 'current_turn',
         'ref', client_ref,
         'trust', 'untrusted_user_input'
       )),
       'personalMemoryUsed', false,
       'externalResearchUsed', false
     ),
     'safety', jsonb_build_object(
       'sensitiveDataDetected', false,
       'promptInjectionDetected', false,
       'publicActionRequested', false,
       'memoryProposalAllowed', propose_memory
     ),
     'arbitration', jsonb_build_object(
       'outcome', CASE WHEN propose_memory THEN 'approval_required' ELSE 'clarification_required' END,
       'rationale', 'Legacy turn retained without inferred authority.',
       'appliedRules', jsonb_build_array('no_silent_cross_module_write')
     ),
     'retention', jsonb_build_object(
       'turn', 'confidential',
       'rationale', 'Existing owner-scoped confidential turn.'
     ),
     'recommendedAction', jsonb_build_object(
       'kind', 'clarify',
       'label', 'روشن‌کردن مقصود',
       'targetView', 'today'
     )
   );

ALTER TABLE app.conversation_turns
  ALTER COLUMN orchestration_snapshot SET NOT NULL,
  ADD CONSTRAINT conversation_turns_orchestration_object
    CHECK (jsonb_typeof(orchestration_snapshot) = 'object'),
  ADD CONSTRAINT conversation_turns_orchestration_contract
    CHECK (orchestration_snapshot ?& ARRAY[
      'policyVersion', 'intent', 'route', 'provenance', 'safety',
      'arbitration', 'retention', 'recommendedAction'
    ]),
  ADD CONSTRAINT conversation_turns_orchestration_policy
    CHECK (length(orchestration_snapshot->>'policyVersion') BETWEEN 3 AND 80),
  ADD CONSTRAINT conversation_turns_orchestration_confidence
    CHECK (
      (orchestration_snapshot->'intent'->>'confidence')::numeric BETWEEN 0 AND 1
    );

COMMENT ON COLUMN app.conversation_turns.orchestration_snapshot IS
  'Versioned intent, permissions, provenance, arbitration and retention decision; contains no copied user text.';

COMMIT;
