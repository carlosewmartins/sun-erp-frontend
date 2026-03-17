import { useShortcut } from "./useShortcut";

interface PDVHandlers {
  onF1: () => void;
  onF2: () => void;
  onF3: () => void;
  onF4: () => void;
  onAlt: () => void;
}

export function usePDVShortcuts(handlers: PDVHandlers, disabled = false) {
  useShortcut({ key: "F1",  onPress: handlers.onF1,  disabled, allowInInput: true });
  useShortcut({ key: "F2",  onPress: handlers.onF2,  disabled, allowInInput: true });
  useShortcut({ key: "F3",  onPress: handlers.onF3,  disabled, allowInInput: true });
  useShortcut({ key: "F4",  onPress: handlers.onF4,  disabled, allowInInput: true });
  useShortcut({ key: "Alt", onPress: handlers.onAlt, disabled, allowInInput: true });
}