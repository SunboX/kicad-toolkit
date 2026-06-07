// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.ownership-graph.a1'

/**
 * Builds a read-only PCB primitive ownership graph from normalized KiCad data.
 */
export class KicadPcbOwnershipGraphBuilder {
    /**
     * Builds primitive owner groups keyed by component, routed net, and group.
     * @param {object} pcb Normalized KiCad PCB model.
     * @returns {object}
     */
    static build(pcb = {}) {
        const components = componentRows(pcb.components || [])
        const primitiveOwners = primitiveItems(pcb).map((item) => {
            return primitiveOwner(item, components)
        })
        const primitivesByComponent = groupPrimitiveKeys(
            primitiveOwners,
            'componentName'
        )
        const primitivesByNet = routeNetPrimitiveKeys(primitiveOwners)
        const primitivesByGroup = groupPrimitiveKeys(primitiveOwners, 'groupId')

        return {
            schema: schemaId,
            summary: {
                componentCount: (pcb.components || []).length,
                primitiveCount: primitiveOwners.length,
                netCount: (pcb.nets || []).length,
                groupCount: Object.keys(primitivesByGroup).length
            },
            primitiveOwners,
            componentsByDesignator: Object.fromEntries(
                components.map((component) => [component.designator, component])
            ),
            primitivesByComponent,
            primitivesByNet,
            primitivesByGroup
        }
    }
}

/**
 * Builds component lookup rows.
 * @param {object[]} components Component rows.
 * @returns {object[]}
 */
function componentRows(components) {
    return (components || []).map((component, index) => {
        const designator = String(component?.designator || '')
        return {
            componentIndex: optionalInteger(component?.componentIndex) ?? index,
            designator,
            footprintId:
                component?.footprintId ||
                component?.id ||
                (designator ? 'footprint:' + designator + ':' + index : '')
        }
    })
}

/**
 * Builds primitive iterable entries in stable renderer collection order.
 * @param {object} pcb Normalized PCB model.
 * @returns {object[]}
 */
function primitiveItems(pcb) {
    return [
        ['pad', pcb.pads || []],
        ['track', pcb.tracks || []],
        ['arc', pcb.arcs || []],
        ['via', pcb.vias || []],
        ['text', pcb.texts || []],
        ['fill', pcb.fills || []],
        ['region', pcb.regions || []],
        ['shape-based-region', pcb.shapeBasedRegions || []],
        ['polygon', pcb.polygons || []]
    ].flatMap(([kind, primitives]) => {
        return primitives.map((primitive, index) => ({
            primitiveKind: kind,
            primitiveKey: kind + '-' + index,
            primitive
        }))
    })
}

/**
 * Builds one primitive owner row.
 * @param {object} item Primitive item.
 * @param {object[]} components Component rows.
 * @returns {object}
 */
function primitiveOwner(item, components) {
    const component = componentForPrimitive(item.primitive, components)
    const isRoutePrimitive = ['track', 'arc', 'via'].includes(
        item.primitiveKind
    )
    const netName = isRoutePrimitive
        ? String(item.primitive?.netName || item.primitive?.net || '')
        : ''

    return stripUndefined({
        primitiveKey: item.primitiveKey,
        primitiveKind: item.primitiveKind,
        componentIndex: component?.componentIndex,
        componentName: component?.designator,
        netName,
        groupId: item.primitive?.groupId
    })
}

/**
 * Resolves the component owning one primitive.
 * @param {object} primitive Primitive row.
 * @param {object[]} components Component rows.
 * @returns {object | null}
 */
function componentForPrimitive(primitive, components) {
    const componentIndex = optionalInteger(primitive?.componentIndex)
    if (componentIndex !== null) {
        return (
            components.find((component) => {
                return component.componentIndex === componentIndex
            }) || null
        )
    }

    const ownerText = String(
        primitive?.ownerId ||
            primitive?.ownerIndex ||
            primitive?.footprintId ||
            primitive?.footprintReference ||
            ''
    )
    if (!ownerText) return null

    return (
        components.find((component) => {
            return (
                ownerText === component.footprintId ||
                ownerText.includes(component.designator)
            )
        }) || null
    )
}

/**
 * Groups primitive keys by one owner field.
 * @param {object[]} primitiveOwners Primitive owner rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function groupPrimitiveKeys(primitiveOwners, field) {
    const groups = {}

    for (const owner of primitiveOwners) {
        const key = String(owner?.[field] || '')
        if (!key) continue
        if (!groups[key]) groups[key] = []
        groups[key].push(owner.primitiveKey)
    }

    return groups
}

/**
 * Groups routed primitive keys by net.
 * @param {object[]} primitiveOwners Primitive owner rows.
 * @returns {Record<string, string[]>}
 */
function routeNetPrimitiveKeys(primitiveOwners) {
    const groups = {}

    for (const owner of primitiveOwners) {
        const netName = String(owner.netName || '')
        if (!netName) continue
        if (!groups[netName]) groups[netName] = []
        groups[netName].push(owner.primitiveKey)
    }

    return groups
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
 * Removes undefined and empty string fields.
 * @param {Record<string, unknown>} value Source object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined && entryValue !== ''
        })
    )
}
