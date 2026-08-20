import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { type useAnimatedProps } from 'react-native-reanimated';

/**
 * `Sheet` — the ONLY component in the app permitted to import `expo-blur`.
 *
 * ## Why the boundary exists
 *
 * Direction E is glass, and glass is the one part of it whose cost is unknown on the target
 * platform (`docs/device-measurement-session.md` §4). If a future Android measurement says the
 * blur is unaffordable, the difference between a **one-token change** and a **redesign** is
 * entirely whether screens reached for `BlurView` directly.
 *
 * So they may not. `eslint.config.mjs` bans `expo-blur` everywhere under `apps/mobile/` except
 * `src/design/`, which makes this a boundary rather than an intention.
 *
 * ## Why `flat` is a designed state and not a degradation
 *
 * **E's identity is layering, occlusion, shadow and the shuffle — none of which is blur.** Blur is
 * a surface finish on top of that structure. A `Sheet` with `frosted={false}` is still a sheet
 * that stacks and occludes; it is E without frost, not direction F.
 *
 * **The flat fill is AUTHORED, not derived, and that is the subtle part.** A blurred backdrop
 * samples the busy ground beneath it; a flat fill does not. To read at the same visual weight they
 * need different alpha, so the flat value is a decision made by eye rather than a computed
 * fallback. `FLAT_FILL` below is that decision for the bake-off palette, and Phase 4B replaces both
 * constants with a `{ blurIntensity, flatFill }` pair per surface token.
 *
 * **The contrast test in Phase 4F must run over BOTH.** A ratio verified against the frosted
 * surface says nothing about the flat one — they composite differently.
 *
 * ## What is NOT here yet
 *
 * `frosted` is a prop. In Phase 4B it becomes a read of `theme.surfaces.liveBlurLayers`, so that
 * the whole app's glass budget is one number in one place. The prop is the shape that change will
 * slot into, not a permanent API.
 */

/**
 * THE ANDROID BLUR METHOD, SET EXPLICITLY RATHER THAN INHERITED.
 *
 * `expo-blur` defaults `blurMethod` to `'none'` on Android, which renders **a semi-transparent view
 * and no blur at all** — its README says "This package only supports iOS." So the frosted look is
 * an iOS identity today, and stating that here is the difference between a decision and an
 * accident that a dependency update can flip without anyone noticing.
 *
 * The alternatives, and why neither is taken (`docs/device-measurement-session.md` §0):
 *
 * - `'dimezisBlurView'` — frost on all Android. Expo's own type documentation warns it "may lead
 *   to decreased performance on Android SDK 30 and below", and it puts §4's 10x extrapolation back
 *   in play.
 * - `'dimezisBlurViewSdk31Plus'` — frost on Android 12+, flat below. Two Android appearances to
 *   design and test rather than one.
 *
 * Both also need `BlurTargetView` plumbing that iOS does not: on Android a `BlurView` blurs a
 * NOMINATED target, while on iOS `BlurTargetView` compiles to a plain `View` because the platform
 * blurs whatever is behind it. **Android has no true backdrop filter even with blur enabled**, so
 * adopting one is a layout constraint and not only a performance decision.
 *
 * E's identity is layering, occlusion, shadow and the shuffle. Frost is a surface finish, and this
 * is the cheap place to decline it.
 */
const ANDROID_BLUR_METHOD = 'none';

/** The frosted sheet's own tint, sitting over the platform blur. */
const FROSTED_TINT = 'rgba(255,255,255,0.062)';

/**
 * The flat sheet's fill. **Deliberately heavier than `FROSTED_TINT`**: with no blur beneath it,
 * the same alpha reads as a barely-there wash rather than as a surface. Chosen by eye against the
 * `#0E0F11` ground, and it is the value Phase 4F's contrast test has to check alongside the other.
 */
const FLAT_FILL = 'rgba(255,255,255,0.085)';

export type SheetProps = {
  /** Phase 4B: derived from `theme.surfaces.liveBlurLayers`, not passed. */
  readonly frosted: boolean;
  readonly intensity?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
};

export function Sheet({ frosted, intensity = 26, style, children }: SheetProps) {
  return (
    <View style={[styles.base, frosted ? styles.frosted : styles.flat, style]}>
      {frosted ? (
        <BlurView
          blurMethod={ANDROID_BLUR_METHOD}
          intensity={intensity}
          tint="dark"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}

/**
 * A blur whose intensity is driven from the UI thread.
 *
 * Exported separately because it is a MEASUREMENT affordance rather than a design primitive:
 * `docs/device-measurement-session.md` prices direction D's dolly on exactly this — an animated
 * blur radius, which unlike a static one cannot be cached and must re-read its source every frame.
 * Nothing in the shipping UI should use it without a reason recorded in the motion inventory.
 */
export function AnimatedBlurOverlay({
  animatedProps,
}: {
  // The return type of `useAnimatedProps`, rather than `AnimatedProps<...>`: under
  // `exactOptionalPropertyTypes` the latter widens `intensity` to `number | undefined` inside the
  // SharedValue and stops being assignable. Same shape `fps-meter.tsx` uses for its readouts.
  readonly animatedProps: ReturnType<typeof useAnimatedProps<{ intensity: number }>>;
}) {
  return (
    <AnimatedBlur
      animatedProps={animatedProps}
      blurMethod={ANDROID_BLUR_METHOD}
      tint="dark"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

/**
 * The static sheet styles, exported so a caller can compose without re-deriving the fill — which
 * is the other way the flat/frosted pair drifts apart.
 */
export const SHEET_FILLS = { flat: FLAT_FILL, frosted: FROSTED_TINT } as const;

const styles = StyleSheet.create({
  base: {
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // NOTE (docs/web-preview-traps.md trap 5): this shadow is the iOS group plus Android's
  // `elevation`, and the two cannot express the same ramp. E's signature transition is a card
  // lifting AS ITS SHADOW LENGTHENS, and that ramp is not implemented here at all — the spike
  // animates opacity and transform only. So this instrument UNDER-measures E, and the shadow ramp
  // remains unvalidated on any platform. RN 0.86 ships a cross-platform `boxShadow`; moving to it
  // is a separate change, because interpolating it per frame is not the same problem as setting it.
  flat: { backgroundColor: FLAT_FILL },
  frosted: { backgroundColor: FROSTED_TINT },
});
