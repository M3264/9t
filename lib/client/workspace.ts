export async function workspaceApi(url: string, init?: RequestInit) {
  const response = await fetch(url, init),
    data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
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
  return value < 1024
    ? `${value}B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)}KB`
      : `${(value / 1048576).toFixed(1)}MB`;
}
