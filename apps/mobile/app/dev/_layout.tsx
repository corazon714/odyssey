import { Stack } from 'expo-router';

/**
 * The developer-tools route group. **Renders nothing outside `__DEV__`, so it cannot ship.**
 *
 * The guard is here rather than on each screen because expo-router builds its route tree from the
 * filesystem: a screen that guards itself is still a reachable route with a resolvable URL, and
 * `/dev/motion-lab` typed into a production build would render a blank screen rather than a 404.
 * Returning `null` from the layout removes the whole subtree from the navigator.
 *
 * `__DEV__` is a global Metro replaces with a literal at build time, so the dead branch is
 * stripped from the production bundle rather than merely skipped at run time.
 *
 * Default export: expo-router requires one from every file under `app/`, which is the single
 * exception CLAUDE.md rule 6 names.
 */
export default function DevLayout() {
  if (!__DEV__) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
