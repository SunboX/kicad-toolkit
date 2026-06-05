// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.svg-model-cross-link.a1'

/**
 * Validates KiCad semantic SVG links against parsed model records.
 */
export class KicadSvgModelCrossLinkValidator {
    /**
     * Validates semantic SVG data attributes against a KiCad model.
     * @param {object} documentModel Parsed schematic or PCB model.
     * @param {string} svgMarkup SVG markup.
     * @returns {object}
     */
    static validate(documentModel, svgMarkup) {
        const documentKind = documentKindOf(documentModel)
        const expectedElements = expectedElementsFor(documentModel)
        const expectedByKey = new Map(
            expectedElements.map((element) => [element.elementKey, element])
        )
        const svgElements = svgElementsFrom(svgMarkup)
        const renderedKeys = new Set(
            svgElements.map((element) => element.elementKey).filter(Boolean)
        )
        const missingElements = expectedElements.filter(
            (element) => !renderedKeys.has(element.elementKey)
        )
        const orphanElements = svgElements.filter((element) => {
            return (
                element.elementKey &&
                !expectedByKey.has(element.elementKey) &&
                !isRendererOwnedElement(element.elementKey, documentKind)
            )
        })
        const unresolvedReferences = unresolvedReferencesFor(
            documentModel,
            svgElements
        )
        const metadata = metadataElements(svgMarkup)

        return {
            schema: schemaId,
            documentKind,
            summary: {
                expectedElementCount: expectedElements.length,
                renderedElementCount: renderedKeys.size,
                linkedElementCount:
                    expectedElements.length - missingElements.length,
                missingElementCount: missingElements.length,
                orphanElementCount: orphanElements.length,
                unresolvedReferenceCount: unresolvedReferences.length,
                metadataElementCount: metadata.elements.length
            },
            missingElements,
            orphanElements,
            unresolvedReferences,
            metadata
        }
    }
}

/**
 * Determines the document kind.
 * @param {object} documentModel Parsed model.
 * @returns {'schematic' | 'pcb' | 'unknown'}
 */
function documentKindOf(documentModel) {
    if (documentModel?.schematic) return 'schematic'
    if (documentModel?.pcb || documentModel?.footprints) return 'pcb'
    return 'unknown'
}

/**
 * Builds expected semantic element descriptors.
 * @param {object} documentModel Parsed model.
 * @returns {object[]}
 */
function expectedElementsFor(documentModel) {
    if (documentModel?.schematic) {
        return schematicExpectedElements(documentModel.schematic)
    }
    if (documentModel?.pcb || documentModel?.footprints) {
        return pcbExpectedElements(documentModel)
    }
    return []
}

/**
 * Builds expected schematic element descriptors for renderer-emitted keys.
 * @param {object} schematic Schematic payload.
 * @returns {object[]}
 */
function schematicExpectedElements(schematic) {
    return collectionElements('schematic', [
        ['lines', 'line', schematic?.lines || []],
        ['texts', 'text', schematic?.texts || []],
        ['pins', 'pin', schematic?.pins || []]
    ])
}

/**
 * Builds expected PCB element descriptors for renderer-emitted keys.
 * @param {object} documentModel Parsed model.
 * @returns {object[]}
 */
function pcbExpectedElements(documentModel) {
    const board =
        documentModel?.pcb?.kicadBoard || documentModel?.pcb || documentModel
    const drawings = board.drawings || []
    const pads = board.pads || []
    return [
        ...collectionElements('pcb', [
            [
                'drawings',
                'track',
                drawings.filter((drawing) => drawing.type === 'segment')
            ],
            [
                'drawings',
                'via',
                drawings.filter((drawing) => drawing.type === 'via')
            ],
            [
                'drawings',
                'zone',
                drawings.filter((drawing) => drawing.type === 'zone')
            ],
            [
                'drawings',
                'arc',
                drawings.filter(
                    (drawing) =>
                        drawing.type === 'arc' && drawing.sourceType === 'arc'
                )
            ],
            ['pads', 'pad', pads],
            ['texts', 'text', board.texts || []],
            ['footprints', 'component', board.footprints || []]
        ]),
        ...collectionElements('pcb', [
            [
                'drawings',
                'via-hole',
                drawings.filter((drawing) => drawing.type === 'via')
            ],
            ['pads', 'pad-hole', pads.filter((pad) => pad.drill)]
        ])
    ]
}

/**
 * Builds descriptors for one or more primitive collections.
 * @param {string} prefix Element key prefix.
 * @param {[string, string, object[]][]} collections Collections.
 * @returns {object[]}
 */
function collectionElements(prefix, collections) {
    const elements = []
    for (const [collectionKey, primitiveKind, records] of collections) {
        for (const [index, record] of (records || []).entries()) {
            elements.push({
                elementKey: prefix + '-' + primitiveKind + '-' + index,
                collectionKey,
                primitiveKind,
                recordId: recordId(record)
            })
        }
    }
    return elements
}

/**
 * Resolves a stable record id.
 * @param {object} record Source record.
 * @returns {string}
 */
function recordId(record) {
    return String(record?.id || record?.uuid || record?.recordId || '')
}

/**
 * Extracts SVG elements carrying semantic element keys.
 * @param {string} svgMarkup SVG markup.
 * @returns {object[]}
 */
function svgElementsFrom(svgMarkup) {
    const elements = []
    const tagPattern = /<[^>]+data-element-key="[^"]+"[^>]*>/giu
    let match = tagPattern.exec(String(svgMarkup || ''))
    while (match) {
        const attrs = dataAttributes(match[0])
        elements.push({
            elementKey: attrs.elementKey || '',
            primitive: attrs.primitive || '',
            component: attrs.component || '',
            net: attrs.net || '',
            pin: attrs.pin || '',
            attrs
        })
        match = tagPattern.exec(String(svgMarkup || ''))
    }
    return elements
}

/**
 * Extracts data attributes from one SVG tag.
 * @param {string} tag SVG tag.
 * @returns {Record<string, string>}
 */
function dataAttributes(tag) {
    const attrs = {}
    const attrPattern = /data-([a-z0-9-]+)="([^"]*)"/giu
    let match = attrPattern.exec(tag || '')
    while (match) {
        attrs[camelCase(match[1])] = decodeEntities(match[2])
        match = attrPattern.exec(tag || '')
    }
    return attrs
}

/**
 * Reports unresolved component and net references.
 * @param {object} documentModel Parsed model.
 * @param {object[]} svgElements SVG semantic rows.
 * @returns {object[]}
 */
function unresolvedReferencesFor(documentModel, svgElements) {
    const components = componentNames(documentModel)
    const nets = netNames(documentModel)
    const unresolved = []

    for (const element of svgElements) {
        if (element.component && !components.has(element.component)) {
            unresolved.push({
                elementKey: element.elementKey,
                referenceKind: 'component',
                value: element.component
            })
        }
        if (element.net && !nets.has(element.net)) {
            unresolved.push({
                elementKey: element.elementKey,
                referenceKind: 'net',
                value: element.net
            })
        }
    }

    return unresolved
}

/**
 * Collects known component names.
 * @param {object} documentModel Parsed model.
 * @returns {Set<string>}
 */
function componentNames(documentModel) {
    return new Set(
        [
            ...(documentModel?.schematic?.components || []).map(
                (component) => component.designator
            ),
            ...(documentModel?.pcb?.components || []).map(
                (component) => component.designator
            ),
            ...(documentModel?.pcb?.kicadBoard?.footprints || []).map(
                (footprint) => footprint.reference
            )
        ].filter(Boolean)
    )
}

/**
 * Collects known net names.
 * @param {object} documentModel Parsed model.
 * @returns {Set<string>}
 */
function netNames(documentModel) {
    return new Set(
        [
            ...(documentModel?.schematic?.nets || []).map((net) => net.name),
            ...(documentModel?.pcb?.nets || []).map((net) => net.name),
            ...(documentModel?.pcb?.kicadBoard?.nets || []).map(
                (net) => net.name
            )
        ].filter(Boolean)
    )
}

/**
 * Extracts SVG metadata element descriptors.
 * @param {string} svgMarkup SVG markup.
 * @returns {{ elements: object[] }}
 */
function metadataElements(svgMarkup) {
    const elements = []
    const pattern = /<metadata\b([^>]*)>([\s\S]*?)<\/metadata>/giu
    let match = pattern.exec(String(svgMarkup || ''))
    while (match) {
        const attrs = attributes(match[1] || '')
        elements.push({
            id: attrs.id || '',
            schema: attrs['data-schema'] || '',
            byteLength: match[2].length
        })
        match = pattern.exec(String(svgMarkup || ''))
    }
    return { elements }
}

/**
 * Extracts generic attributes from markup.
 * @param {string} source Attribute source.
 * @returns {Record<string, string>}
 */
function attributes(source) {
    const attrs = {}
    const pattern = /([a-z0-9:-]+)="([^"]*)"/giu
    let match = pattern.exec(source || '')
    while (match) {
        attrs[match[1]] = decodeEntities(match[2])
        match = pattern.exec(source || '')
    }
    return attrs
}

/**
 * Checks renderer-owned element keys that do not map to source records.
 * @param {string} elementKey Element key.
 * @param {string} documentKind Document kind.
 * @returns {boolean}
 */
function isRendererOwnedElement(elementKey, documentKind) {
    if (documentKind === 'pcb' && elementKey === 'pcb-board-outline') {
        return true
    }
    return false
}

/**
 * Converts kebab-case data names to camelCase.
 * @param {string} value Kebab-case value.
 * @returns {string}
 */
function camelCase(value) {
    return String(value || '').replace(/-([a-z0-9])/giu, (_match, char) =>
        char.toUpperCase()
    )
}

/**
 * Decodes common XML entities.
 * @param {string} value Encoded value.
 * @returns {string}
 */
function decodeEntities(value) {
    return String(value || '')
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/&lt;/gu, '<')
        .replace(/&gt;/gu, '>')
        .replace(/&amp;/gu, '&')
}
