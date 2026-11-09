export type HapticEventType =
  | 'move'
  | 'rotate'
  | 'softDrop'
  | 'hardDrop'
  | 'squareLock'
  | 'sweepTick'
  | 'sweepClear'
  | 'skinChange'
  | 'gameOver';

const HAPTIC_PATTERNS: Record<HapticEventType, number | number[]> = {
  move: 7,
  rotate: 11,
  softDrop: 5,
  hardDrop: [16, 18, 28],
  squareLock: [14, 24, 22],
  sweepTick: 9,
  sweepClear: [22, 20, 42, 24, 55],
  skinChange: [35, 35, 70],
  gameOver: [90, 45, 130],
};

class HapticEngine {
  private enabled = true;
  private listeners: Set<(type: HapticEventType, intensity: number) => void> = new Set();

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.trigger('rotate');
    }
    return this.enabled;
  }

  public onPulse(cb: (type: HapticEventType, intensity: number) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public trigger(type: HapticEventType, comboScale = 1): void {
    if (!this.enabled) return;

    const pattern = HAPTIC_PATTERNS[type];
    try {
      const hasActivation =
        typeof navigator !== 'undefined' &&
        ('userActivation' in navigator
          ? Boolean((navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation?.hasBeenActive)
          : true);
      if (hasActivation && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        if (type === 'sweepClear' && comboScale > 1 && Array.isArray(pattern)) {
          const scaled = pattern.map((ms) => Math.min(120, Math.round(ms * (1 + Math.min(3, comboScale) * 0.2))));
          navigator.vibrate(scaled);
        } else {
          navigator.vibrate(pattern);
        }
      }
    } catch {
      // Ignore vibration errors in restricted contexts
    }

    const intensityMap: Record<HapticEventType, number> = {
      move: 0.2,
      softDrop: 0.15,
      rotate: 0.35,
      sweepTick: 0.3,
      hardDrop: 0.65,
      squareLock: 0.55,
      sweepClear: Math.min(1, 0.75 + comboScale * 0.08),
      skinChange: 0.9,
      gameOver: 1.0,
    };

    const intensity = intensityMap[type] ?? 0.3;
    this.listeners.forEach((cb) => cb(type, intensity));
  }
}

export const haptics = new HapticEngine();
