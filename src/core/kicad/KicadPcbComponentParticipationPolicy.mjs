// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Normalizes KiCad footprint attributes into participation flags.
 */
export class KicadPcbComponentParticipationPolicy {
    /**
     * Resolves BOM, netlist, and pick-place participation for one component.
     * @param {object} component Component or footprint row.
     * @returns {object}
     */
    static resolve(component = {}) {
        const flags = flagsForComponent(component)
        const mountKind = mountKindForFlags(flags)

        return {
            designator: designator(component),
            name: mountKind,
            displayName: displayName(mountKind),
            mountKind,
            includeInBom: !(flags.excludeFromBom || flags.doNotPopulate),
            includeInNetlist: !(flags.boardOnly || flags.virtual),
            includeInPnp: !(
                flags.excludeFromPositionFiles ||
                flags.doNotPopulate ||
                flags.virtual
            ),
            flags
        }
    }
}

/**
 * Builds normalized participation flags from component fields and attributes.
 * @param {object} component Component or footprint row.
 * @returns {object}
 */
function flagsForComponent(component) {
    const attributes = attributeSet(component)
    const virtual =
        booleanField(component, 'virtual') || attributes.has('virtual')
    const doNotPopulate =
        booleanField(component, 'doNotPopulate') ||
        booleanField(component, 'dnp') ||
        attributes.has('dnp') ||
        attributes.has('do_not_populate') ||
        attributes.has('exclude_from_board')
    const boardOnly =
        booleanField(component, 'boardOnly') || attributes.has('board_only')
    const excludeFromBom =
        virtual ||
        booleanField(component, 'excludeFromBom') ||
        attributes.has('exclude_from_bom')
    const excludeFromPositionFiles =
        virtual ||
        booleanField(component, 'excludeFromPositionFiles') ||
        attributes.has('exclude_from_pos_files') ||
        attributes.has('exclude_from_position_files')

    return {
        boardOnly,
        doNotPopulate,
        excludeFromBom,
        excludeFromPositionFiles,
        throughHole:
            booleanField(component, 'throughHole') ||
            attributes.has('through_hole') ||
            attributes.has('thru_hole') ||
            attributes.has('th'),
        virtual
    }
}

/**
 * Builds a normalized attribute set.
 * @param {object} component Component or footprint row.
 * @returns {Set<string>}
 */
function attributeSet(component) {
    const values = [
        ...(Array.isArray(component.attributes) ? component.attributes : []),
        ...(Array.isArray(component.attrs) ? component.attrs : []),
        component.attribute,
        component.attr,
        component.mountKind,
        component.type
    ]

    return new Set(
        values
            .map((value) =>
                String(value || '')
                    .trim()
                    .toLowerCase()
                    .replace(/[\s-]+/gu, '_')
            )
            .filter(Boolean)
    )
}

/**
 * Resolves a boolean field with common KiCad parser spellings.
 * @param {object} component Component or footprint row.
 * @param {string} key Canonical key.
 * @returns {boolean}
 */
function booleanField(component, key) {
    return component?.[key] === true
}

/**
 * Resolves a component designator.
 * @param {object} component Component or footprint row.
 * @returns {string}
 */
function designator(component) {
    return String(
        component?.designator ||
            component?.reference ||
            component?.ref ||
            component?.name ||
            ''
    ).trim()
}

/**
 * Resolves a normalized mount kind from participation flags.
 * @param {object} flags Participation flags.
 * @returns {string}
 */
function mountKindForFlags(flags) {
    if (flags.virtual) return 'virtual'
    if (flags.boardOnly) return 'board-only'
    if (flags.throughHole) return 'through-hole'
    return 'smd'
}

/**
 * Resolves a display label for a mount kind.
 * @param {string} mountKind Mount kind.
 * @returns {string}
 */
function displayName(mountKind) {
    if (mountKind === 'smd') return 'SMD'
    if (mountKind === 'through-hole') return 'Through Hole'
    if (mountKind === 'board-only') return 'Board Only'
    if (mountKind === 'virtual') return 'Virtual'
    return 'Standard'
}
