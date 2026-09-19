/**
 * FxDirector — imperative FX bus.
 * UI code calls fx.trackChange() / fx.impact() / fx.wipe();
 * ShaderStage (and later DOM effects) subscribe.
 */

type Handler = (strength: number) => void;

class FxDirector {
  private impactHandlers = new Set<Handler>();
  private wipeHandlers = new Set<Handler>();

  onImpact(h: Handler) {
    this.impactHandlers.add(h);
    return () => this.impactHandlers.delete(h);
  }

  onWipe(h: Handler) {
    this.wipeHandlers.add(h);
    return () => this.wipeHandlers.delete(h);
  }

  /** Punchy moment — play/pause, big button press. */
  impact(strength = 1) {
    this.impactHandlers.forEach((h) => h(strength));
  }

  /** Screen transition / track change wipe. */
  wipe(strength = 1) {
    this.wipeHandlers.forEach((h) => h(strength));
  }
}

export const fx = new FxDirector();
