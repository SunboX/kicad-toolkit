// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

const MILS_PER_MM = 39.37007874015748

/**
 * Shared primitive conversions for Circuit JSON adapters.
 */
export class CircuitJsonModelAdapterPrimitives {
    /**
     * Returns a deterministic id scope for one parsed file.
     * @param {Record<string, unknown>} model
     * @param {string} sourceFormat
     * @returns {string}
     */
    static idScope(model, sourceFormat) {
        return CircuitJsonModelAdapterPrimitives.id('', [
            sourceFormat,
            model.fileType || 'document',
            model.fileName || model.summary?.title || 'untitled'
        ])
    }

    /**
     * Returns a deterministic Circuit JSON id.
     * @param {string} scope
     * @param {unknown[]} parts
     * @returns {string}
     */
    static id(scope, parts) {
        const idParts = [scope, ...parts]
            .filter(
                (part) => part !== undefined && part !== null && part !== ''
            )
            .map((part) => CircuitJsonModelAdapterPrimitives.#idPart(part))

        return ['cj', ...idParts].filter(Boolean).join('_')
    }

    /**
     * Returns a string value.
     * @param {unknown} value
     * @param {string} fallback
     * @returns {string}
     */
    static string(value, fallback) {
        const text = String(value ?? '').trim()
        return text || fallback
    }

    /**
     * Returns a finite number value.
     * @param {unknown} value
     * @param {number | null} fallback
     * @returns {number | null}
     */
    static number(value, fallback) {
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric : fallback
    }

    /**
     * Returns a numeric pin number when the source value is numeric.
     * @param {unknown} value
     * @returns {number | undefined}
     */
    static pinNumber(value) {
        if (String(value ?? '').trim() === '') return undefined
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric : undefined
    }

    /**
     * Returns a Circuit JSON source port name from a raw pad or pin label.
     * @param {unknown} value Raw source label.
     * @returns {string}
     */
    static sourcePortName(value) {
        const text = CircuitJsonModelAdapterPrimitives.string(value, 'pin')
        const pinNumber = CircuitJsonModelAdapterPrimitives.pinNumber(text)

        return pinNumber === undefined ? text : `pin${pinNumber}`
    }

    /**
     * Returns unique source port hints preserving the raw source label.
     * @param {string} name Normalized port name.
     * @param {unknown} rawName Raw port name.
     * @returns {string[]}
     */
    static sourcePortHints(name, rawName) {
        return [
            ...new Set([
                CircuitJsonModelAdapterPrimitives.string(name, 'pin'),
                CircuitJsonModelAdapterPrimitives.string(rawName, '')
            ])
        ].filter(Boolean)
    }

    /**
     * Returns a schema-friendly source net name while preserving source case.
     * @param {unknown} value Raw source net label.
     * @param {string} fallback Fallback net name.
     * @returns {string}
     */
    static sourceNetName(value, fallback = 'NET') {
        const rawName = CircuitJsonModelAdapterPrimitives.string(
            value,
            fallback
        )
        const normalized = rawName
            .replace(/\+/gu, '_P')
            .replace(/-/gu, '_')
            .replace(/[^A-Za-z0-9]+/gu, '_')
            .replace(/_+/gu, '_')
            .replace(/^_+|_+$/gu, '')
        const candidate =
            normalized ||
            CircuitJsonModelAdapterPrimitives.string(fallback, 'NET')
                .replace(/[^A-Za-z0-9]+/gu, '_')
                .replace(/_+/gu, '_')
                .replace(/^_+|_+$/gu, '') ||
            'NET'

        return /^\d/u.test(candidate) ? `net_${candidate}` : candidate
    }

    /**
     * Converts a mil value to millimeters.
     * @param {unknown} value
     * @param {number} fallback
     * @returns {number}
     */
    static milNumber(value, fallback) {
        return CircuitJsonModelAdapterPrimitives.round(
            (CircuitJsonModelAdapterPrimitives.number(value, fallback) || 0) /
                MILS_PER_MM
        )
    }

    /**
     * Returns an unscaled point.
     * @param {unknown} x
     * @param {unknown} y
     * @returns {{ x: number, y: number }}
     */
    static point(x, y) {
        return {
            x: CircuitJsonModelAdapterPrimitives.round(
                CircuitJsonModelAdapterPrimitives.number(x, 0) || 0
            ),
            y: CircuitJsonModelAdapterPrimitives.round(
                CircuitJsonModelAdapterPrimitives.number(y, 0) || 0
            )
        }
    }

    /**
     * Returns a mil-scaled point.
     * @param {unknown} x
     * @param {unknown} y
     * @returns {{ x: number, y: number }}
     */
    static milPoint(x, y) {
        return {
            x: CircuitJsonModelAdapterPrimitives.milNumber(x, 0),
            y: CircuitJsonModelAdapterPrimitives.milNumber(y, 0)
        }
    }

    /**
     * Rounds model coordinates to a stable precision.
     * @param {number} value
     * @returns {number}
     */
    static round(value) {
        return Math.round(value * 1_000_000) / 1_000_000
    }

    /**
     * Returns array values only.
     * @param {unknown} value
     * @returns {unknown[]}
     */
    static array(value) {
        return Array.isArray(value) ? value : []
    }

    /**
     * Infers the source format label.
     * @param {Record<string, unknown>} model
     * @returns {string}
     */
    static sourceFormat(model) {
        if (model.sourceFormat) return String(model.sourceFormat)
        if (
            String(model.fileType || '')
                .toLowerCase()
                .includes('kicad')
        ) {
            return 'KiCad'
        }
        return 'Altium Designer'
    }

    /**
     * Returns a component map key.
     * @param {Record<string, unknown>} component
     * @param {number} componentIndex
     * @returns {string}
     */
    static componentKey(component, componentIndex) {
        return String(component.componentIndex ?? componentIndex)
    }

    /**
     * Returns a source port id.
     * @param {string} idScope
     * @param {Record<string, unknown>} primitive
     * @param {number} index
     * @param {string} sourceComponentId
     * @returns {string}
     */
    static sourcePortId(idScope, primitive, index, sourceComponentId) {
        return CircuitJsonModelAdapterPrimitives.id(idScope, [
            'source_port',
            sourceComponentId,
            primitive.name ||
                primitive.pinName ||
                primitive.pinNumber ||
                primitive.number ||
                index
        ])
    }

    /**
     * Returns a source net id.
     * @param {string} idScope
     * @param {unknown} netName
     * @returns {string}
     */
    static sourceNetId(idScope, netName) {
        const rawName = CircuitJsonModelAdapterPrimitives.string(netName, 'NET')
        const normalizedName = CircuitJsonModelAdapterPrimitives.sourceNetName(
            rawName,
            'NET'
        )
        const parts = ['source_net', normalizedName]
        if (
            CircuitJsonModelAdapterPrimitives.#needsSourceNetIdHash(
                rawName,
                normalizedName
            )
        ) {
            parts.push(CircuitJsonModelAdapterPrimitives.#shortHash(rawName))
        }

        return CircuitJsonModelAdapterPrimitives.id(idScope, parts)
    }

    /**
     * Returns or creates a source net id for a PCB primitive.
     * @param {string} idScope
     * @param {Record<string, unknown>} primitive
     * @param {Map<string, string>} sourceNetIds
     * @returns {string | undefined}
     */
    static netIdForPrimitive(idScope, primitive, sourceNetIds) {
        const key = String(
            primitive.netName || primitive.net || primitive.netIndex || ''
        )
        if (!key) return undefined
        if (!sourceNetIds.has(key)) {
            sourceNetIds.set(
                key,
                CircuitJsonModelAdapterPrimitives.sourceNetId(idScope, key)
            )
        }
        return sourceNetIds.get(key)
    }

    /**
     * Returns true when a PCB pad has a drill hole.
     * @param {Record<string, unknown>} pad
     * @returns {boolean}
     */
    static isThroughHolePad(pad) {
        return (
            (CircuitJsonModelAdapterPrimitives.number(pad.holeDiameter, 0) ||
                0) > 0
        )
    }

    /**
     * Returns a Circuit JSON pad shape label.
     * @param {Record<string, unknown>} pad
     * @returns {string}
     */
    static padShape(pad) {
        const shape = String(
            pad.shapeTopName || pad.shapeName || pad.shape || ''
        )
            .toLowerCase()
            .replace(/[\s_-]+/gu, '')
        if (
            CircuitJsonModelAdapterPrimitives.customPadPoints(pad).length >= 3
        ) {
            return 'polygon'
        }
        if (shape.includes('custom')) return 'rect'
        if (shape.includes('roundrect')) return 'rect'
        if (
            shape === 'round' ||
            shape.includes('circle') ||
            shape.includes('circular')
        ) {
            return 'circle'
        }
        if (shape.includes('oval')) return 'pill'
        return 'rect'
    }

    /**
     * Returns normalized SMT pad geometry for Circuit JSON output.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @returns {{ shape: string, width: number, height: number, radius: number, cornerRadius: number, rotation: number, points: { x: number, y: number }[] }}
     */
    static smtPadGeometry(pad) {
        const shape = CircuitJsonModelAdapterPrimitives.padShape(pad)
        const points = CircuitJsonModelAdapterPrimitives.customPadPoints(pad)
        if (shape === 'polygon' && points.length >= 3) {
            return {
                shape,
                width: 0,
                height: 0,
                radius: 0,
                cornerRadius: 0,
                rotation: 0,
                points
            }
        }

        const width = CircuitJsonModelAdapterPrimitives.milNumber(
            pad.sizeTopX || pad.sizeX || pad.width,
            0
        )
        const height = CircuitJsonModelAdapterPrimitives.milNumber(
            pad.sizeTopY || pad.sizeY || pad.height,
            0
        )
        const rotation = CircuitJsonModelAdapterPrimitives.normalizedRotation(
            pad.rotation ?? pad.holeRotation ?? 0
        )
        const dimensions =
            CircuitJsonModelAdapterPrimitives.#rightAnglePadDimensions(
                width,
                height,
                rotation
            )

        return {
            shape,
            width: dimensions.width,
            height: dimensions.height,
            radius: CircuitJsonModelAdapterPrimitives.round(
                Math.min(dimensions.width, dimensions.height) / 2
            ),
            cornerRadius: CircuitJsonModelAdapterPrimitives.padCornerRadius(
                pad,
                dimensions.width,
                dimensions.height
            ),
            rotation: dimensions.rotation,
            points: []
        }
    }

    /**
     * Returns custom pad polygon points in board coordinates.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @returns {{ x: number, y: number }[]}
     */
    static customPadPoints(pad) {
        const directPoints = CircuitJsonModelAdapterPrimitives.array(pad.points)
        if (directPoints.length >= 3) {
            return directPoints.map((point) =>
                CircuitJsonModelAdapterPrimitives.point(point.x, point.y)
            )
        }

        const primitive = CircuitJsonModelAdapterPrimitives.array(
            pad.customPrimitives
        ).find((candidate) => {
            return (
                String(candidate?.type || '').toLowerCase() === 'polygon' &&
                CircuitJsonModelAdapterPrimitives.array(candidate.points)
                    .length >= 3
            )
        })
        if (!primitive) return []

        return CircuitJsonModelAdapterPrimitives.array(primitive.points).map(
            (point) =>
                CircuitJsonModelAdapterPrimitives.#padLocalPoint(pad, point)
        )
    }

    /**
     * Returns a rounded-rectangle corner radius in millimeters.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {number} width Pad width in millimeters.
     * @param {number} height Pad height in millimeters.
     * @returns {number}
     */
    static padCornerRadius(pad, width, height) {
        const explicitRadius = CircuitJsonModelAdapterPrimitives.number(
            pad.corner_radius ?? pad.rect_border_radius,
            null
        )
        if (explicitRadius !== null) {
            return CircuitJsonModelAdapterPrimitives.round(explicitRadius)
        }

        const ratio =
            CircuitJsonModelAdapterPrimitives.number(
                pad.roundrectRatio ?? pad.roundrect_rratio,
                null
            ) ??
            CircuitJsonModelAdapterPrimitives.#percentRatio(
                pad.cornerRadiusTop ?? pad.cornerRadius
            )

        if (ratio === null) return 0
        return CircuitJsonModelAdapterPrimitives.round(
            Math.min(width, height) * ratio
        )
    }

    /**
     * Normalizes a degree rotation into Circuit JSON's positive range.
     * @param {unknown} value Rotation in degrees.
     * @returns {number}
     */
    static normalizedRotation(value) {
        const numeric = CircuitJsonModelAdapterPrimitives.number(value, 0) || 0
        const normalized = ((numeric % 360) + 360) % 360
        return CircuitJsonModelAdapterPrimitives.round(normalized)
    }

    /**
     * Returns a normalized board side.
     * @param {unknown} layer
     * @returns {'top' | 'bottom'}
     */
    static side(layer) {
        return String(layer || '')
            .toLowerCase()
            .includes('bottom')
            ? 'bottom'
            : 'top'
    }

    /**
     * Returns a normalized Circuit JSON layer reference.
     * @param {Record<string, unknown>} primitive
     * @returns {string}
     */
    static layerName(primitive) {
        const layerName = String(primitive.layerName || primitive.layer || '')
            .toLowerCase()
            .trim()
        const layerId = CircuitJsonModelAdapterPrimitives.number(
            primitive.layerId,
            null
        )
        const innerMatch = layerName.match(/^in(\d+)(?:\.cu)?$/u)
        if (layerName.includes('bottom') || layerName === 'b.cu') {
            return 'bottom'
        }
        if (layerName.includes('top') || layerName === 'f.cu') {
            return 'top'
        }
        if (innerMatch) return `inner${innerMatch[1]}`
        if (layerId === 0 || layerId === 1) return 'top'
        if (layerId === 31 || layerId === 32) return 'bottom'
        return 'top'
    }

    /**
     * Returns the Circuit JSON layer list for one PCB pad or port.
     * @param {Record<string, unknown>} primitive
     * @returns {string[]}
     */
    static layers(primitive) {
        if (CircuitJsonModelAdapterPrimitives.isThroughHolePad(primitive)) {
            return ['top', 'bottom']
        }
        return [CircuitJsonModelAdapterPrimitives.layerName(primitive)]
    }

    /**
     * Returns a normalized Circuit JSON layer reference for PCB text.
     * @param {Record<string, unknown>} primitive PCB text primitive.
     * @returns {string}
     */
    static pcbTextLayer(primitive) {
        const layerName = String(primitive.layerName || primitive.layer || '')
            .toLowerCase()
            .trim()
        const side =
            CircuitJsonModelAdapterPrimitives.#graphicLayerSide(layerName)

        if (layerName.includes('silk')) return `${side}_silkscreen`
        if (layerName.includes('fab')) return `${side}_fabrication`
        if (layerName.includes('mask')) return `${side}_solder_mask`
        if (layerName.includes('paste')) return `${side}_solder_paste`
        if (layerName.includes('adhes')) return `${side}_adhesive`
        if (layerName.includes('edge')) return 'edge_cuts'
        if (layerName === 'dwgs.user') return 'drawings_user'
        if (layerName === 'cmts.user') return 'comments_user'
        if (layerName === 'eco1.user') return 'eco1_user'
        if (layerName === 'eco2.user') return 'eco2_user'
        return CircuitJsonModelAdapterPrimitives.layerName(primitive)
    }

    /**
     * Returns true when a PCB text primitive is on a silkscreen layer.
     * @param {Record<string, unknown>} primitive PCB text primitive.
     * @returns {boolean}
     */
    static isPcbSilkscreenText(primitive) {
        return CircuitJsonModelAdapterPrimitives.pcbTextLayer(
            primitive
        ).includes('silkscreen')
    }

    /**
     * Returns true when a PCB text primitive is on a fabrication layer.
     * @param {Record<string, unknown>} primitive PCB text primitive.
     * @returns {boolean}
     */
    static isPcbFabricationText(primitive) {
        return CircuitJsonModelAdapterPrimitives.pcbTextLayer(
            primitive
        ).includes('fabrication')
    }

    /**
     * Returns a PCB text font size in millimeters.
     * @param {Record<string, unknown>} primitive PCB text primitive.
     * @returns {number}
     */
    static pcbTextFontSize(primitive) {
        return CircuitJsonModelAdapterPrimitives.round(
            CircuitJsonModelAdapterPrimitives.number(
                primitive.fontSize ??
                    primitive.font?.size ??
                    primitive.font?.height ??
                    primitive.sizeY ??
                    primitive.height,
                1
            ) || 1
        )
    }

    /**
     * Returns an optional PCB text stroke width.
     * @param {Record<string, unknown>} primitive PCB text primitive.
     * @returns {number | undefined}
     */
    static pcbTextStrokeWidth(primitive) {
        const strokeWidth = CircuitJsonModelAdapterPrimitives.number(
            primitive.strokeWidth ??
                primitive.stroke_width ??
                primitive.thickness ??
                primitive.font?.thickness,
            null
        )

        return strokeWidth === null
            ? undefined
            : CircuitJsonModelAdapterPrimitives.round(strokeWidth)
    }

    /**
     * Returns true when a text primitive is explicitly hidden.
     * @param {Record<string, unknown>} primitive Text primitive.
     * @returns {boolean}
     */
    static isHiddenText(primitive) {
        return (
            primitive.visible === false ||
            primitive.hidden === true ||
            primitive.isHidden === true ||
            primitive.is_hidden === true
        )
    }

    /**
     * Returns normalized copper layers for one via-like primitive.
     * @param {Record<string, unknown>} primitive
     * @returns {string[]}
     */
    static copperLayers(primitive) {
        const values = []
        if (Array.isArray(primitive.layers)) {
            values.push(...primitive.layers)
        } else if (typeof primitive.layers === 'string') {
            values.push(...primitive.layers.split(','))
        }

        if (typeof primitive.layer === 'string') {
            values.push(...primitive.layer.split(','))
        }

        const normalized = values
            .flatMap((value) =>
                CircuitJsonModelAdapterPrimitives.#normalizeCopperLayer(value)
            )
            .filter(Boolean)
        const unique = [...new Set(normalized)]

        return unique.length > 0 ? unique : ['top', 'bottom']
    }

    /**
     * Returns schematic port facing direction.
     * @param {Record<string, unknown>} pin
     * @returns {string | null}
     */
    static facingDirection(pin) {
        const orientation = String(pin.orientation || '').toLowerCase()
        if (['left', 'right', 'up', 'down'].includes(orientation)) {
            return orientation
        }
        if (orientation === 'top') return 'up'
        if (orientation === 'bottom') return 'down'
        return null
    }

    /**
     * Returns true when a schematic text represents a net label.
     * @param {Record<string, unknown>} text
     * @returns {boolean}
     */
    static isNetLabel(text) {
        const labelKind = String(text.labelKind || '')
            .toLowerCase()
            .trim()
        const propertyName = String(text.propertyName || '')
            .toLowerCase()
            .trim()
        const symbolKind = String(text.symbolKind || '')
            .toLowerCase()
            .trim()
        const role = [text.role, text.kind, text.labelKind, text.recordType]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')
            .toLowerCase()
            .trim()
        return (
            role.includes('net') ||
            role.includes('label') ||
            role.includes('power') ||
            (symbolKind === 'power' && propertyName === 'value') ||
            ['global', 'hierarchical', 'local'].includes(labelKind)
        )
    }

    /**
     * Converts a renderer outline to Circuit JSON points.
     * @param {Record<string, unknown> | undefined} boardOutline
     * @returns {{ x: number, y: number }[]}
     */
    static outlinePoints(boardOutline) {
        const segments = CircuitJsonModelAdapterPrimitives.array(
            boardOutline?.segments
        )
        if (segments.length > 0) {
            const points = segments.map((segment) =>
                CircuitJsonModelAdapterPrimitives.milPoint(
                    segment.x1,
                    segment.y1
                )
            )
            const last = segments[segments.length - 1]
            points.push(
                CircuitJsonModelAdapterPrimitives.milPoint(last.x2, last.y2)
            )
            return points
        }

        const minX =
            CircuitJsonModelAdapterPrimitives.number(boardOutline?.minX, 0) || 0
        const minY =
            CircuitJsonModelAdapterPrimitives.number(boardOutline?.minY, 0) || 0
        const width =
            CircuitJsonModelAdapterPrimitives.number(
                boardOutline?.widthMil,
                0
            ) || 0
        const height =
            CircuitJsonModelAdapterPrimitives.number(
                boardOutline?.heightMil,
                0
            ) || 0

        return [
            CircuitJsonModelAdapterPrimitives.milPoint(minX, minY),
            CircuitJsonModelAdapterPrimitives.milPoint(minX + width, minY),
            CircuitJsonModelAdapterPrimitives.milPoint(
                minX + width,
                minY + height
            ),
            CircuitJsonModelAdapterPrimitives.milPoint(minX, minY + height)
        ]
    }

    /**
     * Strips the extension from a file name.
     * @param {unknown} fileName
     * @returns {string}
     */
    static stripExtension(fileName) {
        return String(fileName || '').replace(/\.[^.]+$/u, '')
    }

    /**
     * Normalizes one source copper layer token.
     * @param {unknown} value Layer value.
     * @returns {string[]}
     */
    static #normalizeCopperLayer(value) {
        const layer = String(value || '')
            .toLowerCase()
            .trim()
        const innerMatch = layer.match(/^in(\d+)(?:\.cu)?$/u)

        if (!layer) return []
        if (layer === '*.cu') return ['top', 'bottom']
        if (layer.includes('bottom') || layer === 'b.cu') return ['bottom']
        if (layer.includes('top') || layer === 'f.cu') return ['top']
        if (innerMatch) return [`inner${innerMatch[1]}`]
        return []
    }

    /**
     * Returns a normalized side for graphic-like PCB layers.
     * @param {string} layerName Lowercase layer name.
     * @returns {'top' | 'bottom'}
     */
    static #graphicLayerSide(layerName) {
        return layerName.includes('bottom') || layerName.startsWith('b.')
            ? 'bottom'
            : 'top'
    }

    /**
     * Returns dimensions after folding exact right-angle rotations.
     * @param {number} width Pad width.
     * @param {number} height Pad height.
     * @param {number} rotation Rotation in degrees.
     * @returns {{ width: number, height: number, rotation: number }}
     */
    static #rightAnglePadDimensions(width, height, rotation) {
        if (Math.abs(rotation - 90) < 0.000001) {
            return { width: height, height: width, rotation: 0 }
        }
        if (Math.abs(rotation - 180) < 0.000001) {
            return { width, height, rotation: 0 }
        }
        if (Math.abs(rotation - 270) < 0.000001) {
            return { width: height, height: width, rotation: 0 }
        }

        return { width, height, rotation }
    }

    /**
     * Projects one custom primitive point from pad-local coordinates.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {Record<string, unknown>} point Local primitive point.
     * @returns {{ x: number, y: number }}
     */
    static #padLocalPoint(pad, point) {
        const center = CircuitJsonModelAdapterPrimitives.milPoint(pad.x, pad.y)
        const localX = CircuitJsonModelAdapterPrimitives.number(point.x, 0) || 0
        const localY = CircuitJsonModelAdapterPrimitives.number(point.y, 0) || 0
        const rotation =
            (CircuitJsonModelAdapterPrimitives.normalizedRotation(
                pad.rotation
            ) *
                Math.PI) /
            180

        return {
            x: CircuitJsonModelAdapterPrimitives.round(
                center.x +
                    localX * Math.cos(rotation) -
                    localY * Math.sin(rotation)
            ),
            y: CircuitJsonModelAdapterPrimitives.round(
                center.y +
                    localX * Math.sin(rotation) +
                    localY * Math.cos(rotation)
            )
        }
    }

    /**
     * Converts a percentage-style radius value to a ratio.
     * @param {unknown} value Percentage-style value.
     * @returns {number | null}
     */
    static #percentRatio(value) {
        const numeric = CircuitJsonModelAdapterPrimitives.number(value, null)
        if (numeric === null) return null
        return numeric > 1 ? numeric / 100 : numeric
    }

    /**
     * Normalizes one id part.
     * @param {unknown} value
     * @returns {string}
     */
    static #idPart(value) {
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
    }

    /**
     * Returns true when a source net id needs a raw-name discriminator.
     * @param {string} rawName Raw source net label.
     * @param {string} normalizedName Normalized net name.
     * @returns {boolean}
     */
    static #needsSourceNetIdHash(rawName, normalizedName) {
        return (
            /[^A-Za-z0-9_]/u.test(rawName) ||
            normalizedName.toLowerCase() !==
                CircuitJsonModelAdapterPrimitives.#idPart(rawName)
        )
    }

    /**
     * Returns a short deterministic hash for source-name disambiguation.
     * @param {string} value Source value.
     * @returns {string}
     */
    static #shortHash(value) {
        let hash = 0x811c9dc5
        for (const character of value) {
            hash ^= character.codePointAt(0) || 0
            hash = Math.imul(hash, 0x01000193) >>> 0
        }
        return hash.toString(36)
    }
}
