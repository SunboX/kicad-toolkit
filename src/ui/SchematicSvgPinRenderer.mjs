// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const pinTextMargin = 0.1016
const defaultTextStrokeWidth = 0.12

/**
 * Renders normalized KiCad schematic pins to SVG.
 */
export class SchematicSvgPinRenderer {
    /**
     * Renders pins.
     * @param {object[]} pins Pins.
     * @param {object} options Rendering callbacks and colors.
     * @returns {string}
     */
    static renderPins(pins, options) {
        return pins.map((pin) => renderVisiblePin(pin, options)).join('')
    }
}

/**
 * Renders one visible pin with its graphical and text elements.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderVisiblePin(pin, options) {
    if (pin.visible === false) return ''
    const end = pinConnectionPoint(pin)
    const semanticAttributes = options.semanticAttributes
        ? ' ' + options.semanticAttributes(pin)
        : ''
    return [
        `<line class="schematic-pin-line"${semanticAttributes} x1="${options.formatNumber(pin.x)}" y1="${options.formatNumber(pin.y)}" x2="${options.formatNumber(end.x)}" y2="${options.formatNumber(end.y)}" stroke="${options.symbolColor}" stroke-width="0.08"/>`,
        renderPinEndpoint(pin, options),
        renderPinStyle(pin, options),
        renderPinName(pin, options),
        renderPinNumber(pin, options)
    ].join('')
}

/**
 * Renders one visible KiCad pin endpoint at the symbol body.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderPinEndpoint(pin, options) {
    if (!pin.endpointVisible) return ''
    return `<circle class="schematic-pin-endpoint" cx="${options.formatNumber(pin.x)}" cy="${options.formatNumber(pin.y)}" r="0.42" fill="${options.pinMarkerFillColor}" stroke="${options.symbolColor}" stroke-width="0.12"/>`
}

/**
 * Renders one KiCad pin graphic style marker.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderPinStyle(pin, options) {
    const style = normalizedPinStyle(pin)
    if (!style || style === 'line') return ''

    const markers = [
        hasInvertedMarker(style) ? renderInvertedMarker(pin, options) : '',
        hasClockMarker(style) ? renderClockMarker(pin, options) : '',
        hasLowActiveMarker(style) ? renderLowActiveMarker(pin, options) : '',
        style === 'non_logic' ? renderNonLogicMarker(pin, options) : ''
    ].filter(Boolean)
    if (markers.length === 0) return ''

    return `<g class="${pinStyleClasses(style).join(' ')}">${markers.join('')}</g>`
}

/**
 * Renders an inversion bubble marker.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderInvertedMarker(pin, options) {
    const center = markerPoint(pin, 0.12)
    return `<circle class="schematic-pin-style-marker schematic-pin-style-marker--inverted" cx="${options.formatNumber(center.x)}" cy="${options.formatNumber(center.y)}" r="0.36" fill="var(--schematic-fill-color)" stroke="${options.symbolColor}" stroke-width="0.08"/>`
}

/**
 * Renders an edge-clock wedge marker.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderClockMarker(pin, options) {
    const direction = pinDirection(pin)
    const perpendicular = perpendicularDirection(direction)
    const tip = markerPoint(pin, 0.1)
    const base = markerPoint(pin, -0.62)
    const points = [
        tip,
        offsetPoint(base, perpendicular, 0.42),
        offsetPoint(base, perpendicular, -0.42)
    ]
    return `<path class="schematic-pin-style-marker schematic-pin-style-marker--clock" d="${pathFromPoints(points, options)} Z" fill="none" stroke="${options.symbolColor}" stroke-width="0.08" stroke-linejoin="round"/>`
}

/**
 * Renders an active-low bar marker.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderLowActiveMarker(pin, options) {
    const perpendicular = perpendicularDirection(pinDirection(pin))
    const center = markerPoint(pin, 0.34)
    const start = offsetPoint(center, perpendicular, -0.44)
    const end = offsetPoint(center, perpendicular, 0.44)
    return `<line class="schematic-pin-style-marker schematic-pin-style-marker--low-active" x1="${options.formatNumber(start.x)}" y1="${options.formatNumber(start.y)}" x2="${options.formatNumber(end.x)}" y2="${options.formatNumber(end.y)}" stroke="${options.symbolColor}" stroke-width="0.08" stroke-linecap="round"/>`
}

/**
 * Renders a non-logic cross marker.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderNonLogicMarker(pin, options) {
    const center = markerPoint(pin, 0.3)
    const size = 0.34
    const firstStart = { x: center.x - size, y: center.y - size }
    const firstEnd = { x: center.x + size, y: center.y + size }
    const secondStart = { x: center.x - size, y: center.y + size }
    const secondEnd = { x: center.x + size, y: center.y - size }
    return [
        `<line class="schematic-pin-style-marker schematic-pin-style-marker--non-logic" x1="${options.formatNumber(firstStart.x)}" y1="${options.formatNumber(firstStart.y)}" x2="${options.formatNumber(firstEnd.x)}" y2="${options.formatNumber(firstEnd.y)}" stroke="${options.symbolColor}" stroke-width="0.08" stroke-linecap="round"/>`,
        `<line class="schematic-pin-style-marker schematic-pin-style-marker--non-logic" x1="${options.formatNumber(secondStart.x)}" y1="${options.formatNumber(secondStart.y)}" x2="${options.formatNumber(secondEnd.x)}" y2="${options.formatNumber(secondEnd.y)}" stroke="${options.symbolColor}" stroke-width="0.08" stroke-linecap="round"/>`
    ].join('')
}

/**
 * Builds SVG classes for one KiCad pin style.
 * @param {string} style Pin style token.
 * @returns {string[]}
 */
function pinStyleClasses(style) {
    const classes = new Set([
        'schematic-pin-style',
        'schematic-pin-style--' + styleClassToken(style)
    ])
    if (hasInvertedMarker(style)) classes.add('schematic-pin-style--inverted')
    if (hasClockMarker(style)) classes.add('schematic-pin-style--clock')
    if (hasLowActiveMarker(style))
        classes.add('schematic-pin-style--low-active')
    if (style === 'non_logic') classes.add('schematic-pin-style--non-logic')
    return [...classes]
}

/**
 * Resolves a normalized KiCad pin style token.
 * @param {object} pin Pin.
 * @returns {string}
 */
function normalizedPinStyle(pin) {
    return String(pin?.pinStyle || pin?.graphicStyle || 'line').trim()
}

/**
 * Checks whether a style includes an inversion bubble.
 * @param {string} style Pin style token.
 * @returns {boolean}
 */
function hasInvertedMarker(style) {
    return style === 'inverted' || style === 'inverted_clock'
}

/**
 * Checks whether a style includes a clock marker.
 * @param {string} style Pin style token.
 * @returns {boolean}
 */
function hasClockMarker(style) {
    return ['clock', 'inverted_clock', 'clock_low', 'edge_clock_high'].includes(
        style
    )
}

/**
 * Checks whether a style includes an active-low marker.
 * @param {string} style Pin style token.
 * @returns {boolean}
 */
function hasLowActiveMarker(style) {
    return ['input_low', 'clock_low', 'output_low'].includes(style)
}

/**
 * Sanitizes a style token for a CSS class suffix.
 * @param {string} style Pin style token.
 * @returns {string}
 */
function styleClassToken(style) {
    return String(style || 'line')
        .replace(/_/gu, '-')
        .replace(/[^a-zA-Z0-9-]/gu, '')
}

/**
 * Resolves a marker point from the pin body toward the connection endpoint.
 * @param {object} pin Pin.
 * @param {number} distance Distance from body-side point.
 * @returns {{ x: number, y: number }}
 */
function markerPoint(pin, distance) {
    return offsetPoint(
        { x: Number(pin.x || 0), y: Number(pin.y || 0) },
        pinDirection(pin),
        distance
    )
}

/**
 * Resolves the outward pin direction.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinDirection(pin) {
    const end = pinConnectionPoint(pin)
    const x = end.x - Number(pin.x || 0)
    const y = end.y - Number(pin.y || 0)
    const length = Math.hypot(x, y) || 1
    return { x: x / length, y: y / length }
}

/**
 * Resolves the perpendicular direction for a marker.
 * @param {{ x: number, y: number }} direction Direction vector.
 * @returns {{ x: number, y: number }}
 */
function perpendicularDirection(direction) {
    return { x: -direction.y, y: direction.x }
}

/**
 * Offsets one point by a vector.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }} direction Unit direction.
 * @param {number} distance Offset distance.
 * @returns {{ x: number, y: number }}
 */
function offsetPoint(point, direction, distance) {
    return {
        x: point.x + direction.x * distance,
        y: point.y + direction.y * distance
    }
}

/**
 * Builds an SVG path from points.
 * @param {{ x: number, y: number }[]} points Path points.
 * @param {object} options Rendering callbacks.
 * @returns {string}
 */
function pathFromPoints(points, options) {
    return points
        .map((point, index) => {
            return `${index === 0 ? 'M' : 'L'} ${options.formatNumber(point.x)} ${options.formatNumber(point.y)}`
        })
        .join(' ')
}

/**
 * Renders one KiCad pin name inside the symbol body.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderPinName(pin, options) {
    const label = String(pin.name || '').trim()
    if (!label || label === '~' || pin.nameVisible !== true) return ''
    const placement = pinNameTextPlacement(pin)
    const fontSize = Number(pin.nameFontSize || 0.85)
    return options.renderStrokeText({
        className: 'schematic-pin-name',
        x: placement.x,
        y: placement.y,
        value: label,
        color: options.labelColor,
        sizeX: fontSize,
        sizeY: fontSize,
        hAlign: placement.hAlign,
        vAlign: placement.vAlign,
        rotation: placement.rotation
    })
}

/**
 * Renders one KiCad pin number near the symbol body.
 * @param {object} pin Pin.
 * @param {object} options Rendering callbacks and colors.
 * @returns {string}
 */
function renderPinNumber(pin, options) {
    const label = String(pin.designator || '').trim()
    if (!label || label === '~' || pin.numberVisible === false) return ''
    const placement = pinNumberTextPlacement(pin)
    const fontSize = Number(pin.numberFontSize || 0.85)
    return options.renderStrokeText({
        className: 'schematic-pin-number',
        x: placement.x,
        y: placement.y,
        value: label,
        color: options.symbolColor,
        sizeX: fontSize,
        sizeY: fontSize,
        hAlign: placement.hAlign,
        vAlign: placement.vAlign,
        rotation: placement.rotation
    })
}

/**
 * Resolves pin-name text placement from the body-side pin point.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number, hAlign: string, rotation: number }}
 */
function pinNameTextPlacement(pin) {
    const offset = Number(pin.nameOffset || 0.5)
    if (pin.orientation === 'left') {
        return { x: pin.x + offset, y: pin.y, hAlign: 'left', rotation: 0 }
    }
    if (pin.orientation === 'right') {
        return { x: pin.x - offset, y: pin.y, hAlign: 'right', rotation: 0 }
    }
    if (pin.orientation === 'top') {
        return { x: pin.x, y: pin.y + offset, hAlign: 'right', rotation: -90 }
    }
    return { x: pin.x, y: pin.y - offset, hAlign: 'right', rotation: 90 }
}

/**
 * Resolves KiCad pin-number text placement from the pin stub.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number, hAlign: string, vAlign: string, rotation: number }}
 */
function pinNumberTextPlacement(pin) {
    const midpoint = pinStubMidpoint(pin)
    const offset = pinNumberOffset()
    if (pin.orientation === 'left' || pin.orientation === 'right') {
        return {
            x: midpoint.x,
            y: pin.y - offset,
            hAlign: 'center',
            vAlign: 'bottom',
            rotation: 0
        }
    }
    if (pin.orientation === 'top') {
        return {
            x: pin.x - offset,
            y: midpoint.y,
            hAlign: 'center',
            vAlign: 'bottom',
            rotation: -90
        }
    }
    return {
        x: pin.x - offset,
        y: midpoint.y,
        hAlign: 'center',
        vAlign: 'bottom',
        rotation: 90
    }
}

/**
 * Resolves the SVG-space pin-number margin used by KiCad.
 * @returns {number}
 */
function pinNumberOffset() {
    return pinTextMargin + defaultTextStrokeWidth
}

/**
 * Resolves the midpoint between symbol body and connection endpoint.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinStubMidpoint(pin) {
    const end = pinConnectionPoint(pin)
    return {
        x: (pin.x + end.x) / 2,
        y: (pin.y + end.y) / 2
    }
}

/**
 * Resolves pin connection point.
 * @param {object} pin Pin.
 * @returns {{ x: number, y: number }}
 */
function pinConnectionPoint(pin) {
    if (pin.orientation === 'left') return { x: pin.x - pin.length, y: pin.y }
    if (pin.orientation === 'right') return { x: pin.x + pin.length, y: pin.y }
    if (pin.orientation === 'top') return { x: pin.x, y: pin.y - pin.length }
    return { x: pin.x, y: pin.y + pin.length }
}
