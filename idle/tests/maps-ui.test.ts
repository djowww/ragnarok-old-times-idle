import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types';

describe('original map viewer coverage', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('renders the real map viewer for every hunting area in the catalog', async () => {
        vi.stubGlobal('window', { location: {
            hostname: 'game.example', protocol: 'https:', origin: 'https://game.example',
        } });
        const { default: OriginalMap } = await import('../web/components/OriginalMap');
        const catalog = catalogJson as unknown as Catalog;
        const rejectedAreas = catalog.areas
            .filter(area => !renderToStaticMarkup(createElement(OriginalMap, { map: area.map })).includes('<iframe'))
            .map(area => area.id);

        expect(rejectedAreas).toEqual([]);
    });
});
