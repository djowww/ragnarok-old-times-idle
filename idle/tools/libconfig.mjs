/** Safe reader for Hercules libconfig data. Scripts remain inert strings.
 * Derived tables retain Hercules GPL-3.0-or-later licensing. */
export function parseConfig(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        if (/\s/.test(text[i])) {
            i++;
            continue;
        }
        if (text.startsWith('//', i)) {
            i = text.indexOf('\n', i);
            if (i < 0)
                break;
            continue;
        }
        if (text.startsWith('/*', i)) {
            const end = text.indexOf('*/', i + 2);
            if (end < 0)
                throw new Error('Unclosed comment');
            i = end + 2;
            continue;
        }
        if (text.startsWith('<"', i)) {
            const end = text.indexOf('\">', i + 2);
            if (end < 0)
                throw new Error('Unclosed script');
            tokens.push({ v: text.slice(i + 2, end), string: true });
            i = end + 2;
            continue;
        }
        if (text[i] === '"') {
            let value = '';
            i++;
            while (i < text.length && text[i] !== '"') {
                if (text[i] === '\\') {
                    i++;
                    const c = text[i++];
                    value += ({ n: '\n', r: '\r', t: '\t' }[c] ?? c);
                }
                else
                    value += text[i++];
            }
            if (text[i++] !== '"')
                throw new Error('Unclosed string');
            tokens.push({ v: value, string: true });
            continue;
        }
        if ('{}[]():=,;'.includes(text[i])) {
            tokens.push({ v: text[i++] });
            continue;
        }
        const match = text.slice(i).match(/^[^\s{}\[\]():=,;]+/);
        if (!match)
            throw new Error(`Unexpected token at ${i}`);
        tokens.push({ v: match[0] });
        i += match[0].length;
    }
    let cursor = 0;
    const peek = () => tokens[cursor]?.v;
    const take = () => { if (!tokens[cursor])
        throw new Error('Truncated config'); return tokens[cursor++]; };
    function value() { const token = take(); if (token.string)
        return token.v; if (token.v === '{')
        return object('}'); if (token.v === '[' || token.v === '(') {
        const end = token.v === '[' ? ']' : ')', array = [];
        while (peek() !== end) {
            if (peek() === ',' || peek() === ';') {
                take();
                continue;
            }
            array.push(value());
        }
        take();
        return array;
    } if (token.v === 'true' || token.v === 'false')
        return token.v === 'true'; if (/^-?(?:\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?|0x[\da-f]+(?:_[\da-f]+)*)$/i.test(token.v)) {
        const literal = token.v.replaceAll('_', '');
        return /^-0x/i.test(literal) ? -Number(literal.slice(1)) : Number(literal);
    } return token.v; }
    function object(end) { const out = {}; const duplicates = new Set(); while (cursor < tokens.length && peek() !== end) {
        if (peek() === ',' || peek() === ';') {
            take();
            continue;
        }
        const key = take().v;
        const separator = take().v;
        if (separator !== ':' && separator !== '=')
            throw new Error(`Expected colon after ${key}, got ${separator}`);
        const v = value();
        if (Object.hasOwn(out, key)) {
            if (!duplicates.has(key)) {
                out[key] = [out[key]];
                duplicates.add(key);
            }
            out[key].push(v);
        }
        else
            out[key] = v;
    } if (end) {
        if (take().v !== end)
            throw new Error(`Expected ${end}`);
    } return out; }
    return object();
}
export function resolveInheritance(entries, name, trail = []) {
    if (trail.includes(name))
        throw new Error(`Inheritance cycle: ${[...trail, name].join(' -> ')}`);
    const own = entries[name];
    if (!own)
        throw new Error(`Unknown inherited entry ${name}`);
    let result = {};
    for (const parent of own.Inherit ?? [])
        result = { ...result, ...resolveInheritance(entries, parent, [...trail, name]) };
    result = { ...result, ...own };
    if (own.InheritHP)
        result.HPTable = resolveInheritance(entries, own.InheritHP[0], [...trail, name]).HPTable;
    if (own.InheritSP)
        result.SPTable = resolveInheritance(entries, own.InheritSP[0], [...trail, name]).SPTable;
    return result;
}
