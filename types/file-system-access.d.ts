/** Chromium File System Access API (partial) for TS when lib.dom is older. */

export type {};

type AcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

declare global {
  interface Window {
    showOpenFilePicker(options?: {
      multiple?: boolean;
      types?: AcceptType[];
      excludeAcceptAllOption?: boolean;
    }): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: {
      suggestedName?: string;
      types?: AcceptType[];
    }): Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    queryPermission(descriptor?: {
      mode?: "read" | "readwrite";
    }): Promise<PermissionState>;
    requestPermission(descriptor?: {
      mode?: "read" | "readwrite";
    }): Promise<PermissionState>;
  }
}
