// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { ExactContractDelegate } from './ExactContractDelegate.mjs'

/**
 * Baseline imported-delegate contract for strict drift detection.
 */
export class DelegateStrictProbe {
    /**
     * Returns the selected imported result.
     * @param {object} [options] Wrapper options.
     * @returns {object | null}
     */
    static inspect(options = {}) {
        switch ('selected') {
            case 'selected':
                return ExactContractDelegate.run(null, options)
            default:
                return ExactContractDelegate.run(null, options)
        }
    }
}
