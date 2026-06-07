// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.schematic.ownership-graph.a1'

/**
 * Builds schematic ownership graphs from normalized KiCad schematic models.
 */
export class KicadSchematicOwnershipGraphBuilder {
    /**
     * Builds owner-child indexes for schematic components and sheet symbols.
     * @param {object} model KiCad schematic model or schematic object.
     * @returns {object}
     */
    static build(model = {}) {
        const schematic = model.schematic || model || {}
        const owners = ownerRows(schematic)
        const ownerByKey = new Map(
            owners.map((owner) => [owner.ownerKey, owner])
        )
        const records = recordRows(schematic)
        const childrenByOwnerKey = {}
        const parentsByChildKey = {}

        for (const record of records) {
            const owner = ownerByKey.get(String(record.ownerIndex || ''))
            if (!owner) continue
            if (!childrenByOwnerKey[owner.ownerKey]) {
                childrenByOwnerKey[owner.ownerKey] = []
            }
            childrenByOwnerKey[owner.ownerKey].push(record.key)
            parentsByChildKey[record.key] = {
                parentKey: owner.ownerKey,
                ownerKind: owner.ownerKind
            }
        }

        return {
            schema: schemaId,
            summary: {
                ownerCount: owners.length,
                recordCount: records.length,
                componentCount: (schematic.components || []).length,
                sheetSymbolCount: (schematic.sheetSymbols || []).length,
                netCount: (schematic.nets || []).length
            },
            owners,
            records,
            childrenByOwnerKey: sortObjectArrays(childrenByOwnerKey),
            parentsByChildKey,
            indexes: {
                componentsByDesignator: componentIndex(owners),
                recordsByKey: Object.fromEntries(
                    records.map((record) => [record.key, record])
                )
            }
        }
    }
}

/**
 * Builds ownership root rows.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function ownerRows(schematic) {
    return [
        ...(schematic.components || []).map((component, index) =>
            stripEmpty({
                ownerKey:
                    String(component.ownerIndex || '') ||
                    String(component.designator || '') ||
                    'component-' + index,
                ownerKind: 'component',
                name: String(component.designator || ''),
                source: String(component.source || ''),
                index
            })
        ),
        ...(schematic.sheetSymbols || []).map((sheet, index) =>
            stripEmpty({
                ownerKey:
                    String(sheet.ownerIndex || sheet.uuid || '') ||
                    'sheet-symbol-' + index,
                ownerKind: 'sheet-symbol',
                name: String(sheet.name || ''),
                fileName: String(sheet.fileName || ''),
                index
            })
        )
    ]
}

/**
 * Builds schematic child record rows.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function recordRows(schematic) {
    return [
        ...recordFamily('pin', schematic.pins || [], pinDescriptor),
        ...recordFamily('text', schematic.texts || [], textDescriptor),
        ...recordFamily(
            'sheet-entry',
            schematic.sheetEntries || [],
            sheetEntryDescriptor
        ),
        ...recordFamily(
            'directive',
            schematic.directives || [],
            textDescriptor
        ),
        ...recordFamily(
            'rule-area',
            schematic.regions || [],
            ruleAreaDescriptor
        ),
        ...recordFamily('net', schematic.nets || [], netDescriptor)
    ]
}

/**
 * Builds records for one schematic family.
 * @param {string} family Record family.
 * @param {object[]} rows Source rows.
 * @param {(row: object) => object} descriptor Descriptor builder.
 * @returns {object[]}
 */
function recordFamily(family, rows, descriptor) {
    return (rows || []).map((row, index) =>
        stripEmpty({
            key: family + '-' + index,
            recordKind: family,
            ownerIndex: String(row.ownerIndex || ''),
            ...descriptor(row)
        })
    )
}

/**
 * Builds a pin descriptor.
 * @param {object} pin Pin row.
 * @returns {object}
 */
function pinDescriptor(pin) {
    return {
        name: String(pin.name || ''),
        number: String(pin.number || pin.pinNumber || '')
    }
}

/**
 * Builds a text descriptor.
 * @param {object} text Text row.
 * @returns {object}
 */
function textDescriptor(text) {
    return {
        text: String(text.text || text.value || ''),
        propertyName: String(text.propertyName || ''),
        labelKind: String(text.labelKind || '')
    }
}

/**
 * Builds a sheet-entry descriptor.
 * @param {object} entry Sheet entry row.
 * @returns {object}
 */
function sheetEntryDescriptor(entry) {
    return {
        name: String(entry.name || ''),
        kind: String(entry.kind || '')
    }
}

/**
 * Builds a rule-area descriptor.
 * @param {object} region Rule-area row.
 * @returns {object}
 */
function ruleAreaDescriptor(region) {
    return {
        uuid: String(region.uuid || ''),
        doNotPopulate: region.doNotPopulate === true
    }
}

/**
 * Builds a net descriptor.
 * @param {object} net Net row.
 * @returns {object}
 */
function netDescriptor(net) {
    return {
        name: String(net.name || '')
    }
}

/**
 * Builds a component designator lookup.
 * @param {object[]} owners Owner rows.
 * @returns {Record<string, string>}
 */
function componentIndex(owners) {
    return Object.fromEntries(
        owners
            .filter((owner) => owner.ownerKind === 'component' && owner.name)
            .map((owner) => [owner.name, owner.ownerKey])
            .sort(([left], [right]) => left.localeCompare(right))
    )
}

/**
 * Sorts grouped key arrays in one object.
 * @param {Record<string, string[]>} value Grouped keys.
 * @returns {Record<string, string[]>}
 */
function sortObjectArrays(value) {
    return Object.fromEntries(
        Object.entries(value || {})
            .map(([key, values]) => [key, [...values].sort()])
            .sort(([left], [right]) => left.localeCompare(right))
    )
}

/**
 * Removes undefined and empty string fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined && entryValue !== ''
        })
    )
}
