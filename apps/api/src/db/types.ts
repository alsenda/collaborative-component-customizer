export interface MigrationDefinition {
  id: string;
  upSql: string;
  rollbackStrategy: string;
}

export interface RunMigrationsOptions {
  dbFilePath: string;
  now?: () => Date;
}

export interface MigrationRunResult {
  appliedVersions: string[];
}

export interface MigrationStatus {
  appliedVersions: string[];
}
