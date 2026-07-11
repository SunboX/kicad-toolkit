// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * External-style probes for pending ECMAScript completions through finally.
 */
export class TryFinallyFlowProbe {
    /**
     * Preserves a pending break through a normally completing finalizer.
     * @param {object} [options] Probe options.
     * @returns {object} Result.
     */
    static breakThroughFinally(options = {}) {
        while (true) {
            try {
                break
            } finally {
                void options.finallyLive
            }
            void options.ghostAfterTry
        }
        void options.afterBreak
        return { afterBreak: true }
    }

    /**
     * Preserves a pending continue through a normal finalizer.
     * @param {object} [options] Probe options.
     * @returns {object} Result.
     */
    static continueThroughFinally(options = {}) {
        while (true) {
            try {
                continue
            } finally {
                void options.finallyLive
            }
            void options.ghostAfterTry
        }
        return { ghostAfterLoop: true }
    }

    /**
     * Preserves a pending return through a normal finalizer.
     * @param {object} [options] Probe options.
     * @returns {object} Result.
     */
    static returnThroughFinally(options = {}) {
        try {
            return { returned: true }
        } finally {
            void options.finallyLive
        }
        void options.ghostAfterTry
        return { ghostReturn: true }
    }

    /**
     * Does not enter a catch when the try has no throwing completion.
     * @param {object} [options] Probe options.
     * @returns {object} Result.
     */
    static nonThrowingTry(options = {}) {
        try {
            void options.tryLive
        } catch {
            void options.catchGhost
            return { catchGhost: true }
        }
        return { live: true }
    }

    /**
     * Keeps a catch reachable when an invoked operation can throw.
     * @param {object} [options] Probe options.
     * @returns {object} Result.
     */
    static throwingCall(options = {}) {
        try {
            JSON.parse(options.text)
        } catch {
            void options.catchLive
            return { caught: true }
        }
        return { parsed: true }
    }
}
