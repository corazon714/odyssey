import { Stack } from 'expo-router';

/**
 * Root route layout. expo-router requires a default export from every file under app/,
 * which is the single documented exception to the no-default-exports rule (CLAUDE.md 6).
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
