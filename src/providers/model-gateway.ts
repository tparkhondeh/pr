import type { TenantId, UserId } from '../kernel/identity.js';

export type ModelPurpose =
  | 'extract_evidence'
  | 'synthesize_hypothesis'
  | 'strategy_options'
  | 'draft_content'
  | 'evaluate_output';

export type ModelRequest<TInput> = Readonly<{
  requestId: string;
  workflowId: string;
  invocationId: string;
  tenantId: TenantId;
  actorId: UserId;
  purpose: ModelPurpose;
  input: TInput;
  dataClasses: readonly ('public' | 'internal' | 'confidential' | 'restricted')[];
  externalProcessingApproved: boolean;
  schemaName: string;
  maxOutputTokens: number;
  at: Date;
}>;

export type ModelUsage = Readonly<{
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMinorUnits: number;
  costEvidence: 'provider_reported' | 'estimated' | 'none';
  estimatedCostMinorUnits?: number;
}>;

export type ModelResult<TOutput> = Readonly<{
  requestId: string;
  output: TOutput;
  usage: ModelUsage;
  providerTraceId?: string;
  governance?: Readonly<{
    policyVersion: 'prompt-model-governance-v1';
    registryEntryId: string;
    promptVersion: string;
    modelTier: 'economy' | 'balanced' | 'reasoning';
    reservationId: string;
    chargeId: string;
    circuitOpened: boolean;
  }>;
}>;

export interface ModelGateway {
  generateStructured<TInput, TOutput>(
    request: ModelRequest<TInput>,
  ): Promise<ModelResult<TOutput>>;
}

export class DeterministicModelGateway implements ModelGateway {
  public constructor(
    private readonly fixtures: ReadonlyMap<string, unknown>,
  ) {}

  public generateStructured<TInput, TOutput>(
    request: ModelRequest<TInput>,
  ): Promise<ModelResult<TOutput>> {
    if (!this.fixtures.has(request.requestId)) {
      return Promise.reject(
        new Error(`No deterministic fixture for ${request.requestId}`),
      );
    }
    return Promise.resolve({
      requestId: request.requestId,
      output: this.fixtures.get(request.requestId) as TOutput,
      usage: {
        provider: 'deterministic',
        model: 'fixture-v1',
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMinorUnits: 0,
        costEvidence: 'none',
        estimatedCostMinorUnits: 0,
      },
    });
  }
}
