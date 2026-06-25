// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Normalizes KiCad-specific metadata attached to CircuitJSON rows.
 */
export class CircuitJsonKicadProjectMetadata {
    /**
     * Resolves a component symbol name from metadata.
     * @param {object} sourceComponent Source component row.
     * @param {string} fallback Fallback symbol name.
     * @returns {string}
     */
    static symbolName(sourceComponent, fallback) {
        return Utils.safeName(
            CircuitJsonKicadProjectMetadata.#itemName(
                CircuitJsonKicadProjectMetadata.#metadataFrom(
                    sourceComponent,
                    'symbol'
                )
            ) || fallback
        )
    }

    /**
     * Resolves a component footprint name from metadata.
     * @param {object} sourceComponent Source component row.
     * @param {object | null} pcbComponent PCB component row.
     * @param {string} fallback Fallback footprint name.
     * @returns {string}
     */
    static footprintName(sourceComponent, pcbComponent, fallback) {
        return Utils.safeName(
            CircuitJsonKicadProjectMetadata.#itemName(
                CircuitJsonKicadProjectMetadata.footprintMetadata({
                    sourceComponent,
                    pcbComponent
                })
            ) || fallback
        )
    }

    /**
     * Resolves a placed symbol library id.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static symbolLibId(context, row) {
        const metadata = CircuitJsonKicadProjectMetadata.symbolMetadata(row)
        const explicit = Utils.text(metadata.libId || metadata.libraryId)
        if (explicit) return explicit
        const genericConnectorLibId =
            CircuitJsonKicadProjectMetadata.genericConnectorSymbolLibId(
                context,
                row
            )
        if (genericConnectorLibId) return genericConnectorLibId
        return (
            CircuitJsonKicadProjectMetadata.symbolLibraryName(context, row) +
            ':' +
            row.symbolName
        )
    }

    /**
     * Resolves the embedded schematic symbol name for one component row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static embeddedSymbolName(context, row) {
        return (
            CircuitJsonKicadProjectMetadata.genericConnectorSymbolLibId(
                context,
                row
            ) || row.symbolName
        )
    }

    /**
     * Resolves a built-in generic connector symbol library id when requested.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static genericConnectorSymbolLibId(context, row) {
        if (context?.useGenericConnectorSymbols !== true) return ''
        if (!CircuitJsonKicadProjectMetadata.#isSimpleConnector(row)) return ''
        if (row.schematicSymbol) return ''
        if (
            Object.keys(CircuitJsonKicadProjectMetadata.symbolMetadata(row))
                .length
        ) {
            return ''
        }

        const pinCount =
            context.sourcePorts?.byComponentId?.get(row.sourceId)?.length || 0
        if (pinCount < 1) return ''
        return 'Connector_Generic:Conn_01x' + String(pinCount).padStart(2, '0')
    }

    /**
     * Resolves a footprint library id.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static footprintLibId(context, row) {
        const metadata = CircuitJsonKicadProjectMetadata.footprintMetadata(row)
        const explicit = Utils.text(metadata.libId || metadata.libraryId)
        if (explicit) return explicit
        return (
            CircuitJsonKicadProjectMetadata.footprintLibraryName(context, row) +
            ':' +
            row.footprintName
        )
    }

    /**
     * Resolves a symbol library name.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static symbolLibraryName(context, row) {
        const metadata = CircuitJsonKicadProjectMetadata.symbolMetadata(row)
        return Utils.safeName(metadata.libraryName || context.libraryName)
    }

    /**
     * Resolves a footprint library name.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {string}
     */
    static footprintLibraryName(context, row) {
        const metadata = CircuitJsonKicadProjectMetadata.footprintMetadata(row)
        return Utils.safeName(metadata.libraryName || context.libraryName)
    }

    /**
     * Resolves symbol metadata for one component row.
     * @param {object} row Component row.
     * @returns {object}
     */
    static symbolMetadata(row) {
        return CircuitJsonKicadProjectMetadata.#metadataFrom(
            row?.sourceComponent,
            'symbol'
        )
    }

    /**
     * Resolves merged footprint metadata for one component row.
     * @param {object} row Component row.
     * @returns {object}
     */
    static footprintMetadata(row) {
        return {
            ...CircuitJsonKicadProjectMetadata.#metadataFrom(
                row?.sourceComponent,
                'footprint'
            ),
            ...CircuitJsonKicadProjectMetadata.#metadataFrom(
                row?.pcbComponent,
                'footprint'
            ),
            ...CircuitJsonKicadProjectMetadata.#metadataFrom(
                row?.standalonePad,
                'footprint'
            )
        }
    }

    /**
     * Returns true when a symbol row should be treated as external.
     * @param {object} row Component row.
     * @returns {boolean}
     */
    static isBuiltinSymbol(row) {
        return CircuitJsonKicadProjectMetadata.#isBuiltin(
            CircuitJsonKicadProjectMetadata.symbolMetadata(row)
        )
    }

    /**
     * Returns true when a footprint row should be treated as external.
     * @param {object} row Component row.
     * @returns {boolean}
     */
    static isBuiltinFootprint(row) {
        return CircuitJsonKicadProjectMetadata.#isBuiltin(
            CircuitJsonKicadProjectMetadata.footprintMetadata(row)
        )
    }

    /**
     * Builds schematic or symbol-library property nodes.
     * @param {object[]} defaults Default property rows.
     * @param {object} metadata KiCad metadata.
     * @returns {Array[]}
     */
    static symbolPropertyNodes(defaults, metadata) {
        return CircuitJsonKicadProjectMetadata.#propertyRows(
            defaults,
            metadata
        ).map((property, index) =>
            CircuitJsonKicadProjectMetadata.#propertyNode(property, index, {
                defaultAt: { x: 0, y: 7.62 + index * 2.54, rotation: 0 }
            })
        )
    }

    /**
     * Builds footprint property nodes.
     * @param {object[]} defaults Default property rows.
     * @param {object} metadata KiCad metadata.
     * @returns {Array[]}
     */
    static footprintPropertyNodes(defaults, metadata) {
        return CircuitJsonKicadProjectMetadata.#propertyRows(
            defaults,
            metadata
        ).map((property, index) =>
            CircuitJsonKicadProjectMetadata.#propertyNode(property, index, {
                defaultAt: { x: 0, y: 3 + index * 1.5, rotation: 0 },
                defaultLayer: 'F.Fab'
            })
        )
    }

    /**
     * Builds a footprint attribute node.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static footprintAttributeNodes(row) {
        const metadata = CircuitJsonKicadProjectMetadata.footprintMetadata(row)
        const attributes = CircuitJsonKicadProjectMetadata.#tokens(
            metadata.attributes || metadata.attr
        )
        return attributes.length ? [['attr', ...attributes]] : []
    }

    /**
     * Builds a footprint embedded-font node.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static footprintEmbeddedFontNodes(row) {
        const value =
            CircuitJsonKicadProjectMetadata.footprintMetadata(row).embeddedFonts
        if (value !== true && value !== false) return []
        return [['embedded_fonts', value ? 'yes' : 'no']]
    }

    /**
     * Builds symbol display metadata nodes.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static symbolDisplayNodes(row) {
        const metadata = CircuitJsonKicadProjectMetadata.symbolMetadata(row)
        return [
            ...CircuitJsonKicadProjectMetadata.#pinNamesNodes(metadata),
            ...CircuitJsonKicadProjectMetadata.#pinNumbersNodes(metadata),
            ...CircuitJsonKicadProjectMetadata.#symbolEmbeddedFontNodes(
                metadata
            )
        ]
    }

    /**
     * Builds placed symbol boolean flag nodes.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static placedSymbolFlagNodes(row) {
        const metadata = CircuitJsonKicadProjectMetadata.symbolMetadata(row)
        return [
            [
                'exclude_from_sim',
                CircuitJsonKicadProjectMetadata.#yesNo(
                    CircuitJsonKicadProjectMetadata.#metadataBoolean(
                        metadata,
                        ['excludeFromSim', 'exclude_from_sim'],
                        false
                    )
                )
            ],
            [
                'in_bom',
                CircuitJsonKicadProjectMetadata.#yesNo(
                    CircuitJsonKicadProjectMetadata.#metadataBoolean(
                        metadata,
                        ['inBom', 'in_bom'],
                        true
                    )
                )
            ],
            [
                'on_board',
                CircuitJsonKicadProjectMetadata.#yesNo(
                    CircuitJsonKicadProjectMetadata.#metadataBoolean(
                        metadata,
                        ['onBoard', 'on_board'],
                        true
                    )
                )
            ],
            [
                'dnp',
                CircuitJsonKicadProjectMetadata.#yesNo(
                    CircuitJsonKicadProjectMetadata.#metadataBoolean(
                        metadata,
                        ['dnp'],
                        false
                    )
                )
            ]
        ]
    }

    /**
     * Resolves explicit footprint model metadata rows.
     * @param {object} row Component row.
     * @returns {object[]}
     */
    static footprintModels(row) {
        const metadata = CircuitJsonKicadProjectMetadata.footprintMetadata(row)
        const models = Array.isArray(metadata.models)
            ? metadata.models
            : [metadata.model]
        return models.filter((model) => model && typeof model === 'object')
    }

    /**
     * Builds a package manifest row for a symbol.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {{ name: string, libraryName: string }}
     */
    static symbolManifestRow(context, row) {
        return {
            name: row.symbolName,
            libraryName: CircuitJsonKicadProjectMetadata.symbolLibraryName(
                context,
                row
            )
        }
    }

    /**
     * Builds a package manifest row for a footprint.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {{ name: string, libraryName: string }}
     */
    static footprintManifestRow(context, row) {
        return {
            name: row.footprintName,
            libraryName: CircuitJsonKicadProjectMetadata.footprintLibraryName(
                context,
                row
            )
        }
    }

    /**
     * Resolves KiCad metadata from a source element.
     * @param {object | undefined | null} element CircuitJSON element.
     * @param {'symbol' | 'footprint'} kind Metadata kind.
     * @returns {object}
     */
    static #metadataFrom(element, kind) {
        if (!element || typeof element !== 'object') return {}
        const snakeName = kind === 'symbol' ? 'kicad_symbol' : 'kicad_footprint'
        const camelName = kind === 'symbol' ? 'kicadSymbol' : 'kicadFootprint'
        return CircuitJsonKicadProjectMetadata.#object(
            element.metadata?.[snakeName] ||
                element.metadata?.[camelName] ||
                element[snakeName] ||
                element[camelName]
        )
    }

    /**
     * Resolves an item name from metadata.
     * @param {object} metadata Metadata row.
     * @returns {string}
     */
    static #itemName(metadata) {
        return Utils.text(
            metadata.name ||
                metadata.symbolName ||
                metadata.footprintName ||
                metadata.libraryItemName
        )
    }

    /**
     * Returns true when metadata marks a row as external.
     * @param {object} metadata Metadata row.
     * @returns {boolean}
     */
    static #isBuiltin(metadata) {
        return (
            metadata.isBuiltin === true ||
            metadata.is_builtin === true ||
            metadata.builtin === true ||
            metadata.source === 'builtin'
        )
    }

    /**
     * Returns true when the source component is a simple connector family.
     * @param {object} row Component row.
     * @returns {boolean}
     */
    static #isSimpleConnector(row) {
        return ['simple_pin_header', 'simple_connector'].includes(
            Utils.text(row?.sourceComponent?.ftype).toLowerCase()
        )
    }

    /**
     * Builds pin-name display nodes from symbol metadata.
     * @param {object} metadata Symbol metadata.
     * @returns {Array[]}
     */
    static #pinNamesNodes(metadata) {
        const pinNames = CircuitJsonKicadProjectMetadata.#object(
            CircuitJsonKicadProjectMetadata.#metadataValue(metadata, [
                'pinNames',
                'pin_names'
            ])
        )
        if (!Object.keys(pinNames).length) return []

        const node = ['pin_names']
        const offset = Utils.number(pinNames.offset, NaN)
        if (Number.isFinite(offset)) node.push(['offset', offset])
        if (
            CircuitJsonKicadProjectMetadata.#metadataBoolean(
                pinNames,
                ['hide', 'hidden'],
                false
            )
        ) {
            node.push('hide')
        }
        return node.length > 1 ? [node] : []
    }

    /**
     * Builds pin-number display nodes from symbol metadata.
     * @param {object} metadata Symbol metadata.
     * @returns {Array[]}
     */
    static #pinNumbersNodes(metadata) {
        const pinNumbers = CircuitJsonKicadProjectMetadata.#object(
            CircuitJsonKicadProjectMetadata.#metadataValue(metadata, [
                'pinNumbers',
                'pin_numbers'
            ])
        )
        if (!Object.keys(pinNumbers).length) return []

        const node = ['pin_numbers']
        if (
            CircuitJsonKicadProjectMetadata.#metadataBoolean(
                pinNumbers,
                ['hide', 'hidden'],
                false
            )
        ) {
            node.push('hide')
        }
        return node.length > 1 ? [node] : []
    }

    /**
     * Builds embedded-font nodes from symbol metadata.
     * @param {object} metadata Symbol metadata.
     * @returns {Array[]}
     */
    static #symbolEmbeddedFontNodes(metadata) {
        const value = CircuitJsonKicadProjectMetadata.#metadataValue(metadata, [
            'embeddedFonts',
            'embedded_fonts'
        ])
        if (value !== true && value !== false) return []
        return [['embedded_fonts', value ? 'yes' : 'no']]
    }

    /**
     * Resolves one metadata field by first defined name.
     * @param {object} metadata Metadata row.
     * @param {string[]} names Candidate field names.
     * @returns {unknown}
     */
    static #metadataValue(metadata, names) {
        for (const name of names) {
            if (Object.hasOwn(metadata, name)) return metadata[name]
        }
        return undefined
    }

    /**
     * Resolves a metadata boolean with loose string handling.
     * @param {object} metadata Metadata row.
     * @param {string[]} names Candidate field names.
     * @param {boolean} fallback Fallback value.
     * @returns {boolean}
     */
    static #metadataBoolean(metadata, names, fallback) {
        const value = CircuitJsonKicadProjectMetadata.#metadataValue(
            metadata,
            names
        )
        if (value === true || value === false) return value
        const text = Utils.text(value).toLowerCase()
        if (['yes', 'true', '1'].includes(text)) return true
        if (['no', 'false', '0'].includes(text)) return false
        return fallback
    }

    /**
     * Converts a boolean to a KiCad yes/no atom.
     * @param {boolean} value Boolean value.
     * @returns {'yes' | 'no'}
     */
    static #yesNo(value) {
        return value ? 'yes' : 'no'
    }

    /**
     * Builds merged property rows.
     * @param {object[]} defaults Default property rows.
     * @param {object} metadata Metadata row.
     * @returns {object[]}
     */
    static #propertyRows(defaults, metadata) {
        const rows = []
        const byName = new Map()

        for (const property of defaults) {
            CircuitJsonKicadProjectMetadata.#upsertProperty(
                rows,
                byName,
                property
            )
        }
        for (const property of CircuitJsonKicadProjectMetadata.#metadataProperties(
            metadata
        )) {
            CircuitJsonKicadProjectMetadata.#upsertProperty(
                rows,
                byName,
                property
            )
        }

        return rows
    }

    /**
     * Adds or merges one property row.
     * @param {object[]} rows Property row list.
     * @param {Map<string, number>} byName Property index by name.
     * @param {object} property Property row.
     * @returns {void}
     */
    static #upsertProperty(rows, byName, property) {
        const name = Utils.text(property.name || property.key)
        if (!name) return
        const normalized = {
            ...property,
            name,
            value: Utils.text(property.value)
        }
        const key = name.toLowerCase()
        if (!byName.has(key)) {
            byName.set(key, rows.length)
            rows.push(normalized)
            return
        }
        rows[byName.get(key)] = { ...rows[byName.get(key)], ...normalized }
    }

    /**
     * Extracts metadata property rows.
     * @param {object} metadata Metadata row.
     * @returns {object[]}
     */
    static #metadataProperties(metadata) {
        const rows = []
        const properties = metadata.properties

        if (metadata.description) {
            rows.push({ name: 'Description', value: metadata.description })
        }
        if (metadata.datasheet) {
            rows.push({ name: 'Datasheet', value: metadata.datasheet })
        }
        if (metadata.supplierPartNumber || metadata.supplier_part_number) {
            rows.push({
                name: 'Supplier Part Number',
                value:
                    metadata.supplierPartNumber || metadata.supplier_part_number
            })
        }
        const keywords = CircuitJsonKicadProjectMetadata.#metadataTextList(
            metadata.keywords || metadata.ki_keywords || metadata.kiKeywords
        )
        if (keywords) {
            rows.push({
                name: 'ki_keywords',
                value: keywords,
                hidden: true
            })
        }
        const footprintFilters =
            CircuitJsonKicadProjectMetadata.#metadataTextList(
                metadata.fp_filters ||
                    metadata.fpFilters ||
                    metadata.footprint_filters ||
                    metadata.footprintFilters ||
                    metadata.ki_fp_filters ||
                    metadata.kiFpFilters
            )
        if (footprintFilters) {
            rows.push({
                name: 'ki_fp_filters',
                value: footprintFilters,
                hidden: true
            })
        }
        if (Array.isArray(properties)) {
            rows.push(...properties.map((property) => ({ ...property })))
        } else if (properties && typeof properties === 'object') {
            rows.push(
                ...Object.entries(properties).map(([name, value]) => ({
                    name,
                    value
                }))
            )
        }

        return rows
    }

    /**
     * Normalizes metadata search lists to KiCad property text.
     * @param {unknown} value Candidate list.
     * @returns {string}
     */
    static #metadataTextList(value) {
        if (Array.isArray(value)) {
            return value
                .map((entry) => Utils.text(entry))
                .filter(Boolean)
                .join(' ')
        }
        if (typeof value === 'string') return value.trim()
        if (!value || typeof value !== 'object') return ''
        return Object.entries(value)
            .filter(([, enabled]) => enabled === true)
            .map(([entry]) => entry)
            .join(' ')
    }

    /**
     * Builds one KiCad property node.
     * @param {object} property Property row.
     * @param {number} index Property index.
     * @param {{ defaultAt: object, defaultLayer?: string }} options Node options.
     * @returns {Array}
     */
    static #propertyNode(property, index, options) {
        const at = CircuitJsonKicadProjectMetadata.#at(
            property.at || property.position,
            options.defaultAt,
            index
        )
        const layer = Utils.text(property.layer || options.defaultLayer)
        const node = [
            'property',
            property.name,
            Utils.text(property.value),
            ['at', at.x, at.y, at.rotation]
        ]
        if (layer) node.push(['layer', layer])
        node.push(CircuitJsonKicadProjectMetadata.#effectsNode(property))
        return node
    }

    /**
     * Resolves a property placement row.
     * @param {unknown} value Candidate placement.
     * @param {object} fallback Fallback placement.
     * @param {number} index Property index.
     * @returns {{ x: number, y: number, rotation: number }}
     */
    static #at(value, fallback, index) {
        if (Array.isArray(value)) {
            return {
                x: Utils.number(value[0], fallback.x),
                y: Utils.number(value[1], fallback.y),
                rotation: Utils.number(value[2], fallback.rotation)
            }
        }
        if (value && typeof value === 'object') {
            return {
                x: Utils.number(value.x, fallback.x),
                y: Utils.number(value.y, fallback.y),
                rotation: Utils.number(value.rotation, fallback.rotation)
            }
        }
        return {
            x: fallback.x,
            y: Utils.round(fallback.y + index * 0),
            rotation: fallback.rotation
        }
    }

    /**
     * Builds a KiCad property effects node.
     * @param {object} property Property row.
     * @returns {Array}
     */
    static #effectsNode(property) {
        const font = CircuitJsonKicadProjectMetadata.#object(property.font)
        const size = CircuitJsonKicadProjectMetadata.#size(font.size)
        const effects = [
            'effects',
            [
                'font',
                ['size', size.x, size.y],
                ['thickness', Utils.number(font.thickness, 0.15)]
            ]
        ]
        if (
            property.hidden === true ||
            property.hide === true ||
            property.isHidden === true ||
            property.is_hidden === true
        ) {
            effects.push(['hide'])
        }
        return effects
    }

    /**
     * Resolves a font size row.
     * @param {unknown} value Candidate size.
     * @returns {{ x: number, y: number }}
     */
    static #size(value) {
        if (Array.isArray(value)) {
            return {
                x: Utils.number(value[0], 1.27),
                y: Utils.number(value[1], 1.27)
            }
        }
        if (value && typeof value === 'object') {
            return {
                x: Utils.number(value.x, 1.27),
                y: Utils.number(value.y, 1.27)
            }
        }
        const size = Utils.number(value, 1.27)
        return { x: size, y: size }
    }

    /**
     * Converts a token-like value into a string array.
     * @param {unknown} value Candidate token value.
     * @returns {string[]}
     */
    static #tokens(value) {
        if (Array.isArray(value)) return value.map((token) => Utils.text(token))
        if (typeof value === 'string')
            return value.split(/\s+/u).filter(Boolean)
        if (!value || typeof value !== 'object') return []
        return Object.entries(value)
            .filter(([, enabled]) => enabled === true)
            .map(([token]) => token)
    }

    /**
     * Returns a plain object or an empty object.
     * @param {unknown} value Candidate object.
     * @returns {object}
     */
    static #object(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {}
    }
}
