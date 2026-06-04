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
