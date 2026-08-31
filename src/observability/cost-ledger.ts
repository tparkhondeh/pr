export type UsageEntry = Readonly<{
  workflowId: string;
  invocationId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMinorUnits: number;
}>;

export type WorkflowCost = Readonly<{
  workflowId: string;
  invocationCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMinorUnits: number;
}>;

export class CostBudgetExceededError extends Error {
  public constructor(
    public readonly workflowId: string,
    public readonly attemptedCostMinorUnits: number,
    public readonly budgetMinorUnits: number,
  ) {
    super(`Cost budget exceeded for workflow ${workflowId}`);
  }
}

export class InMemoryCostLedger {
  readonly #entries = new Map<string, UsageEntry>();

  public constructor(private readonly workflowBudgetMinorUnits: number) {
    if (
      !Number.isSafeInteger(workflowBudgetMinorUnits) ||
      workflowBudgetMinorUnits < 0
    ) {
      throw new Error('Workflow budget must be a non-negative safe integer.');
    }
  }

  public record(entry: UsageEntry): void {
    validateUsage(entry);
    if (this.#entries.has(entry.invocationId)) return;

    const current = this.forWorkflow(entry.workflowId);
    const attemptedCost = current.costMinorUnits + entry.costMinorUnits;
    if (attemptedCost > this.workflowBudgetMinorUnits) {
      throw new CostBudgetExceededError(
        entry.workflowId,
        attemptedCost,
        this.workflowBudgetMinorUnits,
      );
    }
    this.#entries.set(entry.invocationId, entry);
  }

  public forWorkflow(workflowId: string): WorkflowCost {
    const entries = [...this.#entries.values()].filter(
      (entry) => entry.workflowId === workflowId,
    );
    return entries.reduce<WorkflowCost>(
      (total, entry) => ({
        workflowId,
        invocationCount: total.invocationCount + 1,
        inputTokens: total.inputTokens + entry.inputTokens,
        outputTokens: total.outputTokens + entry.outputTokens,
        cachedInputTokens: total.cachedInputTokens + entry.cachedInputTokens,
        costMinorUnits: total.costMinorUnits + entry.costMinorUnits,
      }),
      {
        workflowId,
        invocationCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMinorUnits: 0,
      },
    );
  }
}

function validateUsage(entry: UsageEntry): void {
  for (const [name, value] of Object.entries({
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cachedInputTokens: entry.cachedInputTokens,
    costMinorUnits: entry.costMinorUnits,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative safe integer.`);
    }
  }
  if (entry.cachedInputTokens > entry.inputTokens) {
    throw new Error('Cached input tokens cannot exceed input tokens.');
  }
}

