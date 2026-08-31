export type SqlQueryResult<Row> = Readonly<{
  rows: readonly Row[];
  rowCount: number;
}>;

export interface SqlTransaction {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface SqlTransactionRunner {
  transaction<Result>(operation: (transaction: SqlTransaction) => Promise<Result>): Promise<Result>;
}
