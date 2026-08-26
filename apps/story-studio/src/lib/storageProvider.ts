import {
  LocalTransportError,
  getStorageTransparency,
  openManagedStorageSession,
  revealStorageProject,
  type StorageProviderConnection,
  type StorageTransparency
} from "./localTransport";

export type StorageProviderKind = "local-folder" | "cloud";

export interface StorageProvider {
  readonly providerId: string;
  readonly kind: StorageProviderKind;
  connect(force?: boolean): Promise<StorageProviderConnection>;
  withWriteAccess<T>(operation: (transportContext: string) => Promise<T>): Promise<T>;
  getProjectStatus(projectId: string): Promise<StorageTransparency>;
  openProjectLocation(projectId: string): Promise<void>;
}

export const CLOUD_PROVIDER_PLACEHOLDER = {
  providerId: "story-cloud",
  kind: "cloud",
  label: "Story Cloud",
  available: false
} as const;

export class LocalFolderProvider implements StorageProvider {
  readonly providerId = "local-folder";
  readonly kind = "local-folder";
  private connection: StorageProviderConnection | null = null;

  async connect(force = false): Promise<StorageProviderConnection> {
    if (this.connection && !force) return this.connection;
    try {
      this.connection = await openManagedStorageSession();
      return this.connection;
    } catch (cause) {
      this.connection = null;
      throw authorStorageError(cause);
    }
  }

  async withWriteAccess<T>(operation: (transportContext: string) => Promise<T>): Promise<T> {
    await this.connect();
    try {
      return await operation(this.providerId);
    } catch (cause) {
      if (!(cause instanceof LocalTransportError) || cause.status !== 403) throw cause;
      await this.connect(true);
      try {
        return await operation(this.providerId);
      } catch (retryCause) {
        throw authorStorageError(retryCause);
      }
    }
  }

  async getProjectStatus(projectId: string): Promise<StorageTransparency> {
    return this.withWriteAccess(() => getStorageTransparency(projectId));
  }

  async openProjectLocation(projectId: string): Promise<void> {
    await this.withWriteAccess(() => revealStorageProject(projectId));
  }
}

function authorStorageError(cause: unknown): Error {
  if (cause instanceof LocalTransportError && (cause.status === 401 || cause.status === 403)) {
    return new Error("无法访问当前故事位置，请重新授权。");
  }
  return cause instanceof Error ? cause : new Error("无法访问当前故事位置。");
}
