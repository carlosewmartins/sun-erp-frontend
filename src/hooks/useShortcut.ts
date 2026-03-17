import { useEffect, useRef } from 'react';

interface ShortcutOptions {
  key: string;
  onPress: () => void;
  disabled?: boolean;
  allowInInput?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export function useShortcut({
  key,
  onPress,
  disabled = false,
  allowInInput = false,
  ctrl = false,
  alt = false,
  shift = false,
}: ShortcutOptions) {
  // ref para sempre ter a versão mais recente do callback
  // sem precisar re-registrar o listener a cada render
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (disabled) return;

    function handler(e: KeyboardEvent) {
      if (e.key !== key) return;

      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (isTyping && !allowInInput) return;
      if (ctrl && !e.ctrlKey) return;
      if (alt && !e.altKey) return;
      if (shift && !e.shiftKey) return;

      e.preventDefault();
      onPressRef.current();
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, disabled, allowInInput, ctrl, alt, shift]);
  // onPress propositalmente fora do array — controlado via ref
}