import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';
import Index from '../../app/index';

/**
 * Lives under src/ rather than app/ deliberately: every file under app/ is a route, so
 * an app/__tests__/ directory would be published as a navigable screen.
 */
describe('index route', () => {
  it('renders the placeholder screen', async () => {
    // RNTL 14 made render() async — it returns Promise<RenderResult>, and fireEvent()
    // returns Promise<void>. Forgetting the await fails as "getByText is not a
    // function" rather than as a timing error, which is worth knowing before the first
    // real screen test gets written.
    const { getByText } = await render(<Index />);

    // Asserting on the i18n KEY, not on copy. Until Phase 2 wires i18next the key is
    // what renders, and CLAUDE.md rule 2.4 bans user-visible literals anyway — so this
    // assertion stays valid after translation lands, just against t(key) output.
    expect(getByText('app.placeholder.title')).toBeTruthy();
  });
});
