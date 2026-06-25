// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import path from 'node:path'

/**
 * Runs optional KiCad CLI visual export commands through injected host hooks.
 */
export class KicadCliVisualSnapshotHarness {
    /**
     * Renders schematic, PCB SVG, and optional PCB 3D snapshot artifacts.
     * @param {{ enabled?: boolean, kicadCliPath?: string, projectDir?: string, outputDir?: string, files?: string[], render3d?: boolean, assertNonBlank?: boolean, execFile?: (command: string, args: string[]) => Promise<object>, readFile?: (path: string) => Promise<Uint8Array | ArrayBuffer | string> }} [options] Harness options.
     * @returns {Promise<{ skipped: boolean, reason?: string, artifacts: object[], commands: object[] }>}
     */
    static async render(options = {}) {
        if (options.enabled !== true) {
            return {
                skipped: true,
                reason: 'disabled',
                artifacts: [],
                commands: []
            }
        }
        if (typeof options.execFile !== 'function') {
            throw new Error('KiCad CLI visual snapshots require execFile')
        }

        const commands = KicadCliVisualSnapshotHarness.commands(options)
        const artifacts = []

        for (const command of commands) {
            const result = await options.execFile(command.command, command.args)
            const artifact = { ...command.artifact, result }
            if (options.assertNonBlank === true) {
                artifact.byteLength =
                    await KicadCliVisualSnapshotHarness.#artifactByteLength(
                        artifact.path,
                        options
                    )
            }
            artifacts.push(artifact)
        }

        return { skipped: false, artifacts, commands }
    }

    /**
     * Builds KiCad CLI command descriptors without executing them.
     * @param {{ kicadCliPath?: string, projectDir?: string, outputDir?: string, files?: string[], render3d?: boolean }} [options] Harness options.
     * @returns {{ command: string, args: string[], artifact: object }[]}
     */
    static commands(options = {}) {
        const command = options.kicadCliPath || 'kicad-cli'
        const projectDir = options.projectDir || ''
        const outputDir = options.outputDir || ''
        const files = Array.isArray(options.files) ? options.files : []
        const commands = []

        for (const file of files) {
            if (file.endsWith('.kicad_sch')) {
                commands.push(
                    KicadCliVisualSnapshotHarness.#schematicCommand(
                        command,
                        projectDir,
                        outputDir,
                        file
                    )
                )
            }
            if (file.endsWith('.kicad_pcb')) {
                commands.push(
                    KicadCliVisualSnapshotHarness.#pcbSvgCommand(
                        command,
                        projectDir,
                        outputDir,
                        file
                    )
                )
                if (options.render3d === true) {
                    commands.push(
                        KicadCliVisualSnapshotHarness.#pcbRenderCommand(
                            command,
                            projectDir,
                            outputDir,
                            file
                        )
                    )
                }
            }
        }

        return commands
    }

    /**
     * Builds one schematic SVG export command.
     * @param {string} command KiCad CLI command path.
     * @param {string} projectDir Project directory.
     * @param {string} outputDir Output directory.
     * @param {string} file Schematic file path.
     * @returns {{ command: string, args: string[], artifact: object }}
     */
    static #schematicCommand(command, projectDir, outputDir, file) {
        const output = KicadCliVisualSnapshotHarness.#outputPath(
            outputDir,
            file,
            '.svg'
        )
        return {
            command,
            args: [
                'sch',
                'export',
                'svg',
                '--output',
                output,
                KicadCliVisualSnapshotHarness.#inputPath(projectDir, file)
            ],
            artifact: { kind: 'schematic-svg', path: output }
        }
    }

    /**
     * Builds one PCB SVG export command.
     * @param {string} command KiCad CLI command path.
     * @param {string} projectDir Project directory.
     * @param {string} outputDir Output directory.
     * @param {string} file PCB file path.
     * @returns {{ command: string, args: string[], artifact: object }}
     */
    static #pcbSvgCommand(command, projectDir, outputDir, file) {
        const output = KicadCliVisualSnapshotHarness.#outputPath(
            outputDir,
            file,
            '-pcb.svg'
        )
        return {
            command,
            args: [
                'pcb',
                'export',
                'svg',
                '--output',
                output,
                KicadCliVisualSnapshotHarness.#inputPath(projectDir, file)
            ],
            artifact: { kind: 'pcb-svg', path: output }
        }
    }

    /**
     * Builds one PCB 3D render command.
     * @param {string} command KiCad CLI command path.
     * @param {string} projectDir Project directory.
     * @param {string} outputDir Output directory.
     * @param {string} file PCB file path.
     * @returns {{ command: string, args: string[], artifact: object }}
     */
    static #pcbRenderCommand(command, projectDir, outputDir, file) {
        const output = KicadCliVisualSnapshotHarness.#outputPath(
            outputDir,
            file,
            '-3d.png'
        )
        return {
            command,
            args: [
                'pcb',
                'render',
                '--output',
                output,
                KicadCliVisualSnapshotHarness.#inputPath(projectDir, file)
            ],
            artifact: { kind: 'pcb-3d-png', path: output }
        }
    }

    /**
     * Resolves an input file path.
     * @param {string} projectDir Project directory.
     * @param {string} file File path.
     * @returns {string}
     */
    static #inputPath(projectDir, file) {
        if (path.isAbsolute(file)) return file
        return projectDir ? path.join(projectDir, file) : file
    }

    /**
     * Resolves an output artifact path.
     * @param {string} outputDir Output directory.
     * @param {string} file Source file path.
     * @param {string} suffix Output suffix.
     * @returns {string}
     */
    static #outputPath(outputDir, file, suffix) {
        const stem = path.basename(file).replace(/\.kicad_(sch|pcb)$/u, '')
        const outputName = stem + suffix
        return outputDir ? path.join(outputDir, outputName) : outputName
    }

    /**
     * Reads and validates one generated artifact.
     * @param {string} artifactPath Artifact path.
     * @param {{ readFile?: (path: string) => Promise<Uint8Array | ArrayBuffer | string> }} options Harness options.
     * @returns {Promise<number>}
     */
    static async #artifactByteLength(artifactPath, options) {
        if (typeof options.readFile !== 'function') {
            throw new Error('KiCad CLI visual artifact checks require readFile')
        }
        const bytes = KicadCliVisualSnapshotHarness.#bytes(
            await options.readFile(artifactPath)
        )
        if (bytes.byteLength === 0) {
            throw new Error('Visual artifact is blank: ' + artifactPath)
        }
        return bytes.byteLength
    }

    /**
     * Converts a supported file payload to bytes.
     * @param {Uint8Array | ArrayBuffer | string} value File payload.
     * @returns {Uint8Array}
     */
    static #bytes(value) {
        if (value instanceof Uint8Array) return value
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        }
        if (typeof value === 'string') return new TextEncoder().encode(value)
        return new Uint8Array()
    }
}
