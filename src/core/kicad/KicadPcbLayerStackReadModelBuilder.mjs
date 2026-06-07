// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.layer-stack.a1'
const milsPerMillimeter = 1000 / 25.4

/**
 * Builds KiCad PCB stackup read models from parsed setup metadata.
 */
export class KicadPcbLayerStackReadModelBuilder {
    /**
     * Builds a deterministic stackup report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const board = sourceBoard(pcb)
        const stackup = board.setup?.stackup || {}
        const stackupLayers = Array.isArray(stackup.layers)
            ? stackup.layers
            : []
        const layers = stackupLayers.length
            ? stackupLayers.map(layerRow)
            : fallbackLayerRows(board)
        const diagnostics = stackupLayers.length
            ? []
            : [
                  {
                      code: 'kicad.pcb.layer-stack.missing-stackup',
                      severity: 'info',
                      message:
                          'KiCad PCB did not include setup stackup metadata.'
                  }
              ]

        return {
            schema: schemaId,
            units: { thickness: 'mm', thicknessAlternate: 'mil' },
            summary: summary(
                layers,
                stackup,
                stackupLayers.length > 0,
                diagnostics
            ),
            source: stripEmpty({
                fileName: board.fileName || pcb.fileName || '',
                hasStackup: stackupLayers.length > 0
            }),
            layers,
            materials: materialRows(layers),
            diagnostics,
            indexes: {
                layersByName: indexBy(layers, 'name'),
                layersByKey: indexBy(layers, 'layerKey'),
                layerKeysByRole: keysBy(layers, 'role')
            }
        }
    }
}

/**
 * Resolves the raw KiCad board model from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || pcb || {}
}

/**
 * Builds one stackup layer row.
 * @param {object} layer Parsed stackup layer.
 * @param {number} index Fallback layer index.
 * @returns {object}
 */
function layerRow(layer, index) {
    const name = String(layer?.name || '')
    const type = String(layer?.type || '')
    const role = layerRole(name, type)
    const thicknessMm = round(layer?.thickness)

    return stripEmpty({
        index: optionalInteger(layer?.stackIndex) ?? index,
        name,
        layerKey: layerKey(
            name,
            role,
            optionalInteger(layer?.stackIndex) ?? index
        ),
        type,
        role,
        material: String(layer?.material || ''),
        color: String(layer?.color || ''),
        thicknessMm,
        thicknessMil: round(thicknessMm * milsPerMillimeter),
        epsilonR: round(layer?.epsilonR),
        lossTangent: round(layer?.lossTangent),
        uuid: String(layer?.uuid || '')
    })
}

/**
 * Builds fallback layer rows from declared board layers.
 * @param {object} board Parsed board.
 * @returns {object[]}
 */
function fallbackLayerRows(board) {
    return (board.layers || []).map((layer, index) => {
        const name = String(layer?.name || layer?.layerKey || '')
        const type = String(layer?.type || layer?.role || '')
        const role = layerRole(name, type)
        return stripEmpty({
            index: optionalInteger(layer?.ordinal) ?? index,
            name,
            layerKey: layerKey(
                name,
                role,
                optionalInteger(layer?.ordinal) ?? index
            ),
            type,
            role,
            material: String(layer?.material || ''),
            color: String(layer?.color || ''),
            thicknessMm: round(layer?.thickness),
            thicknessMil: round(
                Number(layer?.thickness || 0) * milsPerMillimeter
            ),
            uuid: String(layer?.uuid || '')
        })
    })
}

/**
 * Builds the report summary.
 * @param {object[]} layers Layer rows.
 * @param {object} stackup Stackup metadata.
 * @param {boolean} stackupDeclared Whether stackup was present.
 * @param {object[]} diagnostics Diagnostics rows.
 * @returns {object}
 */
function summary(layers, stackup, stackupDeclared, diagnostics) {
    const totalThicknessMm = round(
        layers.reduce(
            (total, layer) => total + Number(layer.thicknessMm || 0),
            0
        )
    )

    return {
        layerCount: layers.length,
        copperLayerCount: layers.filter((layer) => layer.role === 'copper')
            .length,
        dielectricLayerCount: layers.filter(
            (layer) => layer.role === 'dielectric'
        ).length,
        materialCount: materialRows(layers).length,
        totalThicknessMm,
        totalThicknessMil: round(totalThicknessMm * milsPerMillimeter),
        stackupDeclared,
        dielectricConstraints: stackup.dielectricConstraints === true,
        edgeConnector: String(stackup.edgeConnector || ''),
        castellatedPads: stackup.castellatedPads === true,
        edgePlating: stackup.edgePlating === true,
        diagnosticCount: diagnostics.length
    }
}

/**
 * Builds material count rows.
 * @param {object[]} layers Layer rows.
 * @returns {object[]}
 */
function materialRows(layers) {
    const counts = new Map()
    for (const layer of layers) {
        const material = String(layer.material || '')
        if (!material) continue
        counts.set(material, (counts.get(material) || 0) + 1)
    }
    return [...counts.entries()]
        .map(([name, layerCount]) => ({ name, layerCount }))
        .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Resolves a stable layer key.
 * @param {string} name Layer name.
 * @param {string} role Layer role.
 * @param {number} index Layer index.
 * @returns {string}
 */
function layerKey(name, role, index) {
    if (role === 'dielectric' && name === 'dielectric') {
        return 'dielectric-' + index
    }
    return name || role + '-' + index
}

/**
 * Resolves a KiCad stackup layer role.
 * @param {string} name Stackup layer name.
 * @param {string} type Stackup type text.
 * @returns {string}
 */
function layerRole(name, type) {
    const normalizedName = String(name || '').toLowerCase()
    const normalizedType = String(type || '').toLowerCase()
    if (normalizedName.endsWith('.cu') || normalizedType === 'copper') {
        return 'copper'
    }
    if (
        normalizedName === 'dielectric' ||
        ['core', 'prepreg', 'dielectric'].includes(normalizedType)
    ) {
        return 'dielectric'
    }
    return 'technical'
}

/**
 * Builds an index from row fields to row positions.
 * @param {object[]} rows Rows to index.
 * @param {string} field Field name.
 * @returns {Record<string, number>}
 */
function indexBy(rows, field) {
    return Object.fromEntries(
        rows
            .map((row, index) => [String(row[field] || ''), index])
            .filter(([key]) => key)
            .sort(([left], [right]) => left.localeCompare(right))
    )
}

/**
 * Groups layer keys by a row field.
 * @param {object[]} rows Rows to group.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        if (!groups[key]) groups[key] = []
        groups[key].push(row.layerKey)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Parses an optional integer.
 * @param {unknown} value Candidate value.
 * @returns {number | null}
 */
function optionalInteger(value) {
    const number = Number(value)
    return Number.isInteger(number) ? number : null
}

/**
 * Rounds a numeric value for deterministic report output.
 * @param {unknown} value Candidate number.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(3)) : 0
}

/**
 * Removes undefined fields while preserving native empty strings.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined
        })
    )
}
