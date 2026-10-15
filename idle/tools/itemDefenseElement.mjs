/** Translate a complete property-only Hercules script; never evaluate script text. */
export function staticDefenseElement(item) {
    if (!item || !['IT_ARMOR', 'IT_CARD'].includes(item.Type)) return undefined;
    const location = item.Loc;
    const armor = location === 'EQP_ARMOR' || location && typeof location === 'object' &&
        location.EQP_ARMOR === true && Object.keys(location).every(key => key === 'EQP_ARMOR');
    if (!armor || [item.OnEquipScript, item.OnUnequipScript, item.ComboScript].some(script =>
        script != null && (typeof script !== 'string' || script.trim()))) return undefined;
    if (typeof item.Script !== 'string') return undefined;
    const match = /^\s*bonus\s+bDefEle\s*,\s*Ele_(Neutral|Water|Earth|Fire|Wind|Poison|Holy|Dark|Ghost|Undead)\s*;\s*$/.exec(item.Script);
    return match?.[1].toLowerCase();
}
