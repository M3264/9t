export class ApiError extends Error {
  status: number;
  violations?: Array<{ field: string; code: string; message: string }>;
  constructor(
    message: string,
    status: number,
    violations?: Array<{ field: string; code: string; message: string }>,
  ) {
    super(message);
    this.status = status;
    this.violations = violations;
  }
}

export async function workspaceApi(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: {
    error?: string;
    violations?: Array<{ field: string; code: string; message: string }>;
  } = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = (data.violations || [])
      .map((v) => `${v.field}: ${v.message}`)
      .join("; ");
    throw new ApiError(
      detail ? `${data.error || "Invalid config"} — ${detail}` : data.error || "Something went wrong",
      response.status,
      data.violations,
    );
  }
  return data;
}

export function timeAgo(value: string) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  return seconds < 60
    ? "now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h`
        : `${Math.floor(seconds / 86400)}d`;
}

export function timeUntil(value: string) {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  return seconds <= 0
    ? "due"
    : seconds < 3600
      ? `${Math.ceil(seconds / 60)}m`
      : seconds < 86400
        ? `${Math.ceil(seconds / 3600)}h`
        : `${Math.ceil(seconds / 86400)}d`;
}

export function formatBytes(value = 0) {
  if (!Number.isFinite(value) || value < 0) return "0B";
  return value < 1024
    ? `${value}B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)}KB`
      : value < 1073741824
        ? `${(value / 1048576).toFixed(1)}MB`
        : `${(value / 1073741824).toFixed(1)}GB`;
}
