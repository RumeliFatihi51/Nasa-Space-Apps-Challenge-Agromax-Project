import { useEffect, useState } from "react";
import { workspaceSync } from "./sync-hub";
// Debounces a burst of writes; consumers refetch through their authorized APIs.
export default function useWorkspaceSync() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let timer;
    const unsubscribe = workspaceSync.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevision((value) => value + 1), 180);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);
  return revision;
}
