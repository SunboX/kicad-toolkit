// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schematicSemanticSchema = 'kicad-toolkit.schematic.svg.semantics.a1'

/**
 * Builds semantic attributes and metadata for KiCad schematic SVG output.
 */
export class SchematicSvgSemanticMetadata {
    /**
     * Returns the KiCad schematic SVG semantic schema id.
     * @returns {string}
     */
    static get schema() {
        return schematicSemanticSchema
    }

    /**
     * Builds semantic lookup context.
     * @param {object} schematic Schematic model.
     * @returns {object}
     */
    static buildContext(schematic) {
        return {
            schematic,
            primitiveIndexes: {
                lines: objectIndexMap(schematic?.lines || []),
                texts: objectIndexMap(schematic?.texts || []),
                pins: objectIndexMap(schematic?.pins || []),
                components: objectIndexMap(schematic?.components || [])
            },
            componentsByOwner: componentsByOwner(schematic?.components || []),
            netByPrimitive: netByPrimitive(schematic?.nets || [])
        }
    }

    /**
     * Builds root SVG semantic attributes.
     * @returns {string}
     */
    static rootAttributes() {
        return renderDataAttributes({
            'data-semantic-schema': schematicSemanticSchema
        })
    }

    /**
     * Builds the metadata sidecar element.
     * @param {object} context Semantic context.
     * @returns {string}
     */
    static metadataElement(context) {
        return (
            '<metadata id="schematic-semantic-metadata" data-schema="' +
            schematicSemanticSchema +
            '">' +
            escapeHtml(JSON.stringify(buildMetadata(context))) +
            '</metadata>'
        )
    }

    /**
     * Builds semantic attributes for a primitive.
     * @param {object} primitive Primitive.
     * @param {string} kind Primitive kind.
     * @param {object} context Semantic context.
     * @returns {string}
     */
    static primitiveAttributes(primitive, kind, context) {
        const component = componentForPrimitive(primitive, context)
        const net = context.netByPrimitive.get(primitive)
        return renderDataAttributes({
            'data-primitive': kind,
            'data-element-key': elementKeyForPrimitive(
                primitive,
                kind,
                context
            ),
            'data-record-id': recordId(primitive, kind, context),
            'data-component': component?.designator,
            'data-pin': kind === 'pin' ? primitive?.designator : undefined,
            'data-net': net?.name
        })
    }
}

/**
 * Builds the JSON metadata sidecar.
 * @param {object} context Semantic context.
 * @returns {object}
 */
function buildMetadata(context) {
    return stripEmpty({
        schema: schematicSemanticSchema,
        nets: netMetadata(context),
        components: componentMetadata(context)
    })
}

/**
 * Builds net metadata records.
 * @param {object} context Semantic context.
 * @returns {object[]}
 */
function netMetadata(context) {
    return (context.schematic?.nets || []).map((net) => {
        const primitives = [
            ...(net.segments || []),
            ...(net.labels || []),
            ...(net.pins || [])
        ]
        const pins = (net.pins || [])
            .map((pin) => {
                const component = componentForPrimitive(pin, context)
                return component?.designator && pin?.designator
                    ? component.designator + ':' + pin.designator
                    : ''
            })
            .filter(Boolean)
        return {
            name: net.name || '',
            elementKeys: primitives
                .map((primitive) => {
                    return elementKeyForPrimitive(
                        primitive,
                        primitiveKind(primitive, context),
                        context
                    )
                })
                .filter(Boolean),
            components: dedupe(pins.map((pin) => pin.split(':')[0])).sort(),
            pins: dedupe(pins).sort()
        }
    })
}

/**
 * Builds component metadata records.
 * @param {object} context Semantic context.
 * @returns {object[]}
 */
function componentMetadata(context) {
    return (context.schematic?.components || []).map((component) => {
        const pins = (context.schematic?.pins || []).filter((pin) => {
            return componentForPrimitive(pin, context) === component
        })
        return {
            designator: component.designator || '',
            elementKeys: [
                elementKeyForPrimitive(component, 'component', context),
                ...pins.map((pin) =>
                    elementKeyForPrimitive(pin, 'pin', context)
                )
            ],
            pins: pins
                .map((pin) => String(pin.designator || ''))
                .filter(Boolean),
            nets: dedupe(
                pins
                    .map((pin) => context.netByPrimitive.get(pin)?.name || '')
                    .filter(Boolean)
            )
        }
    })
}

/**
 * Resolves one primitive kind.
 * @param {object} primitive Primitive.
 * @param {object} context Semantic context.
 * @returns {string}
 */
function primitiveKind(primitive, context) {
    if (context.primitiveIndexes.lines.has(primitive)) return 'line'
    if (context.primitiveIndexes.texts.has(primitive)) return 'text'
    if (context.primitiveIndexes.pins.has(primitive)) return 'pin'
    if (context.primitiveIndexes.components.has(primitive)) return 'component'
    return 'primitive'
}

/**
 * Builds one stable SVG element key.
 * @param {object} primitive Primitive.
 * @param {string} kind Primitive kind.
 * @param {object} context Semantic context.
 * @returns {string}
 */
function elementKeyForPrimitive(primitive, kind, context) {
    const collection = collectionForKind(kind)
    const index = context.primitiveIndexes[collection]?.get(primitive) ?? 0
    return 'schematic-' + kind + '-' + index
}

/**
 * Resolves primitive index collection.
 * @param {string} kind Primitive kind.
 * @returns {string}
 */
function collectionForKind(kind) {
    if (kind === 'line') return 'lines'
    if (kind === 'text') return 'texts'
    if (kind === 'pin') return 'pins'
    if (kind === 'component') return 'components'
    return 'lines'
}

/**
 * Resolves a stable record id.
 * @param {object} primitive Primitive.
 * @param {string} kind Primitive kind.
 * @param {object} context Semantic context.
 * @returns {string}
 */
function recordId(primitive, kind, context) {
    return (
        primitive?.id ||
        primitive?.uuid ||
        primitive?.recordId ||
        elementKeyForPrimitive(primitive, kind, context)
    )
}

/**
 * Resolves component ownership for a primitive.
 * @param {object} primitive Primitive.
 * @param {object} context Semantic context.
 * @returns {object | null}
 */
function componentForPrimitive(primitive, context) {
    const owner = String(primitive?.ownerIndex || primitive?.ownerId || '')
    return owner ? context.componentsByOwner.get(owner) || null : null
}

/**
 * Builds component owner lookups.
 * @param {object[]} components Components.
 * @returns {Map<string, object>}
 */
function componentsByOwner(components) {
    const map = new Map()
    for (const component of components || []) {
        for (const key of [
            component?.ownerIndex,
            component?.id,
            component?.uuid,
            component?.designator
        ]) {
            if (key) map.set(String(key), component)
        }
    }
    return map
}

/**
 * Builds primitive-to-net lookups.
 * @param {object[]} nets Nets.
 * @returns {Map<object, object>}
 */
function netByPrimitive(nets) {
    const map = new Map()
    for (const net of nets || []) {
        for (const primitive of [
            ...(net.segments || []),
            ...(net.labels || []),
            ...(net.pins || [])
        ]) {
            if (primitive) map.set(primitive, net)
        }
    }
    return map
}

/**
 * Builds a map from object identity to array index.
 * @param {object[]} records Records.
 * @returns {Map<object, number>}
 */
function objectIndexMap(records) {
    return new Map(
        (Array.isArray(records) ? records : []).map((item, index) => [
            item,
            index
        ])
    )
}

/**
 * Renders SVG data attributes.
 * @param {Record<string, unknown>} attributes Attributes.
 * @returns {string}
 */
function renderDataAttributes(attributes) {
    return Object.entries(attributes)
        .filter(
            ([, value]) => value !== undefined && value !== null && value !== ''
        )
        .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
        .join(' ')
}

/**
 * Removes empty metadata fields recursively.
 * @param {unknown} value Value.
 * @returns {unknown}
 */
function stripEmpty(value) {
    if (Array.isArray(value)) {
        return value.map(stripEmpty).filter((item) => item !== undefined)
    }
    if (!value || typeof value !== 'object') return value
    const entries = Object.entries(value)
        .map(([key, child]) => [key, stripEmpty(child)])
        .filter(([, child]) => {
            if (child === undefined || child === null || child === '')
                return false
            if (Array.isArray(child) && child.length === 0) return false
            return !(
                typeof child === 'object' &&
                !Array.isArray(child) &&
                Object.keys(child).length === 0
            )
        })
    return Object.fromEntries(entries)
}

/**
 * Deduplicates string values.
 * @param {string[]} values Values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [...new Set(values.filter(Boolean))]
}

/**
 * Escapes text content.
 * @param {unknown} value Value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

/**
 * Escapes SVG attribute values.
 * @param {unknown} value Value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('"', '&quot;')
}
