// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { ExactContractDelegate } from './ExactContractDelegate.mjs'

/**
 * Drifted imported-delegate contract for strict drift detection.
 */
export class DelegateStrictProbe {
    /**
     * Replaces the selected imported result with null.
     * @param {object} [options] Wrapper options.
     * @returns {object | null}
     */
    static inspect(options = {}) {
        switch ('selected') {
            case 'selected':
                return null
            default:
                return ExactContractDelegate.run(null, options)
        }
    }
}
