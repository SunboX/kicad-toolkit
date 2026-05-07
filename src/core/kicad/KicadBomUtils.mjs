// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Groups schematic component metadata into BOM rows.
 * @param {object[]} components Components.
 * @returns {object[]}
 */
export function groupSchematicBomRows(components) {
    const rows = new Map()
    for (const component of components.filter(
        (entry) => !entry.excludeFromBom
    )) {
        const key = [component.value, component.pattern, component.source].join(
            '\u0000'
        )
        if (!rows.has(key)) {
            rows.set(key, {
                designators: [],
                quantity: 0,
                pattern: component.pattern,
                source: component.source || 'KiCad schematic',
                value: component.value || component.pattern
            })
        }
        const row = rows.get(key)
        row.designators.push(component.designator)
        row.quantity = row.designators.length
    }
    return [...rows.values()].sort((left, right) =>
        left.designators[0].localeCompare(right.designators[0])
    )
}
