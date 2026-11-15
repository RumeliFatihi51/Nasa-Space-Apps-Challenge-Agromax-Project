// Carries invalidations only, never private record contents or credentials.
export function createSyncHub() {
  let scope = "",
    generation = 0;
  const listeners = new Set();
  const emit = (reason = "mutation") => {
    generation++;
    for (const listener of listeners) listener({ scope, generation, reason });
  };
  return {
    get scope() {
      return scope;
    },
    setScope(value) {
      if (value !== scope) {
        scope = value;
        emit("scope");
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish() {
      emit();
      return { type: "agromax.invalidate.v1", scope };
    },
    receive(message) {
      if (
        scope &&
        message?.type === "agromax.invalidate.v1" &&
        message.scope === scope
      )
        emit("remote");
    },
    refresh() {
      emit("refresh");
    },
  };
}
export const workspaceSync = createSyncHub();
let channel;
if (typeof window !== "undefined") {
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("agromax-invalidations-v1");
    channel.onmessage = (event) => workspaceSync.receive(event.data);
  }
  window.addEventListener("focus", () => workspaceSync.refresh());
  window.addEventListener("online", () => workspaceSync.refresh());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) workspaceSync.refresh();
  });
  window.setInterval(() => {
    if (!document.hidden) workspaceSync.refresh();
  }, 30000);
}
export function notifyWorkspaceChange(scope = workspaceSync.scope) {
  if (scope !== workspaceSync.scope) return;
  const message = workspaceSync.publish();
  if (message.scope) channel?.postMessage(message);
}
