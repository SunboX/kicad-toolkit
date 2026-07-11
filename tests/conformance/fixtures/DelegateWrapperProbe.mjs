// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { DecoyContractDelegate as DecoyAlias } from './DecoyContractDelegate.mjs'
import { ExactContractDelegate as ExactAlias } from './ExactContractDelegate.mjs'

/**
 * Exercises exact imported-symbol delegation.
 */
export class DelegateWrapperProbe {
    /**
     * Returns one bound exact delegate result.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static inspect(options = {}) {
        const sourceText = 'DecoyAlias.run(null, options)'
        // DecoyAlias.run(null, options) is documentation, not a call.
        const neverCalled = () => DecoyAlias.run(null, options)
        try {
            void sourceText
        } catch (ExactAlias) {
            ExactAlias.run(null, options)
        }
        void neverCalled
        const value = ExactAlias.run(null, options)
        return value
        DecoyAlias.run(null, options)
    }

    /**
     * Keeps a local binding from resolving to the imported alias.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static shadow(options = {}) {
        const ExactAlias = {
            /**
             * Returns one local result.
             * @param {unknown} input Ignored input.
             * @param {object} settings Ignored settings.
             * @returns {object}
             */
            run(input, settings) {
                void input
                void settings
                return { local: true }
            }
        }
        return ExactAlias.run(null, options)
    }

    /**
     * Keeps a literal-dead imported delegate unreachable.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static logicalDead(options = {}) {
        false && ExactAlias.run(null, options)
        return { logical: true }
    }

    /**
     * Selects literal logical operands across imported delegates.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static logicalSelection(options = {}) {
        true || DecoyAlias.run(null, options)
        'present' ?? DecoyAlias.run(null, options)
        null ?? ExactAlias.run(null, options)
        return { logical: true }
    }

    /**
     * Stops before a dead imported default after a selected return.
     * @param {object} [options] Wrapper options.
     * @returns {object | null}
     */
    static selectedSwitch(options = {}) {
        switch ('selected') {
            case 'selected':
                return null
            default:
                return ExactAlias.run(null, options)
        }
    }

    /**
     * Falls through the selected case and stops at an unlabeled break.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static switchFallthrough(options = {}) {
        switch ('selected') {
            case 'selected':
                ExactAlias.run(null, options)
            case 'next':
                break
            default:
                DecoyAlias.run(null, options)
        }
        return { afterSwitch: true }
    }

    /**
     * Lets a finalizer override a pending imported return.
     * @param {object} [options] Wrapper options.
     * @returns {object | null}
     */
    static finallyOverride(options = {}) {
        try {
            return ExactAlias.run(null, options)
        } finally {
            return null
        }
    }

    /**
     * Executes an imported finalizer side effect and preserves the try return.
     * @param {object} [options] Wrapper options.
     * @returns {object}
     */
    static finallySideEffect(options = {}) {
        try {
            return { preserved: true }
        } finally {
            ExactAlias.run(null, options)
        }
    }

    /**
     * Keeps a catch delegate dead when the try returns normally.
     * @param {object} [options] Wrapper options.
     * @returns {null}
     */
    static deadCatch(options = {}) {
        try {
            return null
        } catch {
            return ExactAlias.run(null, options)
        }
    }
}
