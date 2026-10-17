/** Extract a literal property from flat Hercules bonus/skill statements only.
 * Never evaluates scripts, conditions, functions, comments or event scripts.
 * Other bonuses remain explicitly unsupported when the script is compound. */
export function staticWeaponElement(item) {
    if (!item || item.Type !== 'IT_WEAPON' || typeof item.Script !== 'string') return undefined;
    if ([item.OnEquipScript, item.OnUnequipScript, item.ComboScript].some(script =>
        script != null && (typeof script !== 'string' || script.trim()))) return undefined;
    const script = item.Script.trim();
    if (!script.endsWith(';')) return undefined;
    const statements = script.slice(0, -1).split(';').map(statement => statement.trim());
    if (!statements.length || statements.some(statement =>
        !/^(?:bonus[2-5]?\s+[A-Za-z0-9_,\s.+*%\/-]+|skill\s+\w+\s*,\s*\d+)$/.test(statement)
        || statement.includes('//') || statement.includes('/*'))) return undefined;
    const properties = statements.filter(statement => /^bonus\s+bAtkEle\b/.test(statement));
    if (properties.length !== 1) return undefined;
    const match = /^bonus\s+bAtkEle\s*,\s*Ele_(Neutral|Water|Earth|Fire|Wind|Poison|Holy|Dark|Ghost|Undead)$/.exec(properties[0]);
    return match ? { element: match[1].toLowerCase(), complete: statements.length === 1 } : undefined;
}
