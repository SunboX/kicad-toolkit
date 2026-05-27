// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves visible field rotation for placed symbol properties.
 * @param {object} property Symbol property.
 * @param {{ rotation?: number }} transform Symbol placement transform.
 * @returns {number}
 */
export function symbolPropertyTextRotation(property, transform = {}) {
    const propertyRotation = normalizeRotation(
        numberValue(property?.rotation, 0)
    )
    const symbolRotation = normalizeRotation(
        numberValue(transform?.rotation, 0)
    )
    if (symbolRotatesFieldAxes(symbolRotation)) {
        if (isHorizontalRotation(propertyRotation)) return 90
        if (isVerticalRotation(propertyRotation)) return 0
    }
    return propertyRotation
}

/**
 * Checks whether a symbol transform swaps field text axes in KiCad.
 * @param {number} rotation Symbol rotation.
 * @returns {boolean}
 */
function symbolRotatesFieldAxes(rotation) {
    return Math.abs(rotation - 90) < 0.001 || Math.abs(rotation - 270) < 0.001
}

/**
 * Checks whether a KiCad text angle is horizontal.
 * @param {number} rotation Text rotation.
 * @returns {boolean}
 */
function isHorizontalRotation(rotation) {
    return Math.abs(rotation) < 0.001 || Math.abs(rotation - 180) < 0.001
}

/**
 * Checks whether a KiCad text angle is vertical.
 * @param {number} rotation Text rotation.
 * @returns {boolean}
 */
function isVerticalRotation(rotation) {
    return Math.abs(rotation - 90) < 0.001 || Math.abs(rotation - 270) < 0.001
}

/**
 * Normalizes a schematic rotation to KiCad's positive degree range.
 * @param {number} rotation Rotation in degrees.
 * @returns {number}
 */
function normalizeRotation(rotation) {
    const normalized = ((rotation % 360) + 360) % 360
    return Math.abs(normalized - 360) < 0.001 ? 0 : normalized
}

/**
 * Reads a number with fallback.
 * @param {unknown} value Value.
 * @param {number} fallback Fallback.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
