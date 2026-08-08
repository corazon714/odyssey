import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder entry screen. Phase 0 ships toolchain only — the map, preparation,
 * journey and journal features land in later phases.
 *
 * The rendered string is an i18n KEY, not copy. CLAUDE.md rule 2.4 bans user-visible
 * string literals outright, so even a temporary placeholder has to be a key; once
 * i18next is wired in Phase 2 this becomes `t(PLACEHOLDER_KEY)` with no other change.
 */
const PLACEHOLDER_KEY = 'app.placeholder.title';

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  label: { fontVariant: ['tabular-nums'] },
});

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{PLACEHOLDER_KEY}</Text>
    </View>
  );
}
