export type ObjectType = "snippet" | "file" | "link";
export type WorkspaceObject = {
  id: string;
  type: ObjectType;
  name: string;
  content?: string;
  language?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  storageKey?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  expiresAt?: string;
  board?: { x: number; y: number };
};
export type Theme = "system" | "light" | "dark";
export type WorkspaceConfig = {
  initialized: boolean;
  modules: {
    snippets: boolean;
    files: boolean;
    links: boolean;
    board: boolean;
  };
  exposure: string;
  theme: Theme;
  maxSizeMb: number;
  trashRetentionDays: number;
};
export type WorkspaceShare = {
  id: string;
  token: string;
  objectId: string;
  createdAt: string;
  expiresAt?: string;
  accessCount: number;
  object: WorkspaceObject;
};
export type WorkspaceView = "all" | ObjectType | "board" | "shares" | "trash";
