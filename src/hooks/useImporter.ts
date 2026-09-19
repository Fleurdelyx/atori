import { useCallback, useState } from "react";
import {
  importFromDataTransfer,
  importFromDirectory,
  importFromFileList,
  pickDirectory,
  rescanLibrary,
  supportsDirectoryPicker,
  type ImportProgress,
  type ImportResult,
} from "@/core/library/importService";
import { inTauriShell, tauriImportFolder, tauriRescan, tauriRootCount } from "@/core/library/shellIngest";
import { toast } from "@/state/toastStore";

function announce(r: ImportResult) {
  const bits = [`${r.added} added`, `${r.updated} updated`];
  if (r.skipped) bits.push(`${r.skipped} skipped`);
  if (r.failed) bits.push(`${r.failed} failed`);
  toast(`Import complete — ${bits.join(" · ")}`, r.failed ? "error" : "success", "取り込み完了");
}

/** Shared import UX state for Home/Library screens. */
export function useImporter() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importDir = useCallback(async () => {
    // inside the desktop shell the native dialog + fs pipeline replaces FS Access
    if (inTauriShell()) {
      setResult(null);
      const r = await tauriImportFolder(setProgress);
      if (!r) return false; // user cancelled
      setResult(r);
      announce(r);
      setProgress(null);
      return true;
    }
    if (!supportsDirectoryPicker()) {
      toast("Folder picker not supported here — drop files onto the window instead", "info", "取り込み");
      return false;
    }
    const dir = await pickDirectory();
    if (!dir) return false; // user cancelled
    setResult(null);
    const r = await importFromDirectory(dir, setProgress);
    setResult(r);
    announce(r);
    setProgress(null);
    return true;
  }, []);

  const rescan = useCallback(async () => {
    setResult(null);
    if (inTauriShell()) {
      const roots = await tauriRootCount();
      if (roots === 0) {
        toast("No library folders saved yet — import one first", "info", "再スキャン");
        return false;
      }
      const r = await tauriRescan(setProgress);
      if (r) {
        if (r.added === 0 && r.updated === 0) toast("Library up to date", "success", "再スキャン");
        else announce(r);
      }
      setProgress(null);
      return true;
    }
    const { result: r, roots, needsPermission } = await rescanLibrary(setProgress);
    if (roots === 0) {
      toast("No library folders saved yet — import one first", "info", "再スキャン");
      return false;
    }
    if (needsPermission) {
      toast("Folder access expired — click RECONNECT to re-grant", "error", "再スキャン");
      return false;
    }
    if (r) {
      if (r.added === 0 && r.updated === 0) toast("Library up to date", "success", "再スキャン");
      else announce(r);
    }
    setProgress(null);
    return true;
  }, []);

  const importDrop = useCallback(async (dt: DataTransfer) => {
    setResult(null);
    const r = await importFromDataTransfer(dt, setProgress);
    setResult(r);
    announce(r);
    setProgress(null);
  }, []);

  const importList = useCallback(async (files: File[]) => {
    setResult(null);
    const r = await importFromFileList(files, setProgress);
    setResult(r);
    announce(r);
    setProgress(null);
  }, []);

  return { progress, result, importDir, importDrop, importList, rescan, supportsPicker: supportsDirectoryPicker() };
}
