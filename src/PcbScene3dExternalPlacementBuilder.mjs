// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds explicit external-model placements from KiCad component scene data.
 */
export class PcbScene3dExternalPlacementBuilder {
    /**
     * Builds placement records for components with resolved external models.
     * @param {object[]} components Scene components.
     * @param {{ thicknessMil?: number }} [board] Scene board metadata.
     * @returns {object[]}
     */
    static build(components, board = {}) {
        return (Array.isArray(components) ? components : [])
            .filter(
                (component) =>
                    component?.externalModel && component?.modelTransform
            )
            .map((component) =>
                PcbScene3dExternalPlacementBuilder.#buildPlacement(
                    component,
                    board
                )
            )
    }

    /**
     * Builds one placement shape used by host 3D runtimes.
     * @param {object} component Scene component.
     * @param {{ thicknessMil?: number }} board Scene board metadata.
     * @returns {object}
     */
    static #buildPlacement(component, board) {
        return {
            designator: String(component?.designator || ''),
            mountSide: String(component?.mountSide || 'top'),
            rotationDeg: Number(component?.rotationDeg || 0),
            positionMil: {
                x: Number(component?.positionMil?.x || 0),
                y: Number(component?.positionMil?.y || 0),
                z: PcbScene3dExternalPlacementBuilder.#resolveBoardFaceZ(
                    component,
                    board
                )
            },
            bodyPositionMil: { x: 0, y: 0 },
            bodyRotationDeg: 0,
            modelTransform:
                PcbScene3dExternalPlacementBuilder.#buildModelTransform(
                    component?.modelTransform
                ),
            externalModel: component.externalModel
        }
    }

    /**
     * Resolves the PCB face anchor for KiCad footprint 3D models.
     * @param {{ mountSide?: string, positionMil?: { z?: number } }} component Scene component.
     * @param {{ thicknessMil?: number }} board Scene board metadata.
     * @returns {number}
     */
    static #resolveBoardFaceZ(component, board) {
        const thicknessMil = Number(board?.thicknessMil)
        if (!Number.isFinite(thicknessMil) || thicknessMil <= 0) {
            return Number(component?.positionMil?.z || 0)
        }

        const faceZ = thicknessMil / 2
        return String(component?.mountSide || 'top').toLowerCase() === 'bottom'
            ? -faceZ
            : faceZ
    }

    /**
     * Preserves KiCad footprint model metadata for runtime placement. KiCad
     * composes model matrices at render time as translate(offset), rotate(-z),
     * rotate(-y), rotate(-x), scale, so source angles stay unsigned here.
     * @param {object | null | undefined} modelTransform Raw KiCad transform.
     * @returns {{ rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number }, dxMil: number, dyMil: number, dzMil: number, scale: { x: number, y: number, z: number } }}
     */
    static #buildModelTransform(modelTransform) {
        const offsetMil =
            PcbScene3dExternalPlacementBuilder.#resolveModelOffsetMil(
                modelTransform
            )
        const rotationDeg = modelTransform?.rotationDeg || {}

        return {
            rotationDeg: {
                x: PcbScene3dExternalPlacementBuilder.#normalizeModelAngle(
                    rotationDeg.x
                ),
                y: PcbScene3dExternalPlacementBuilder.#normalizeModelAngle(
                    rotationDeg.y
                ),
                z: PcbScene3dExternalPlacementBuilder.#normalizeModelAngle(
                    rotationDeg.z
                )
            },
            offsetMil,
            dxMil: offsetMil.x,
            dyMil: offsetMil.y,
            dzMil: offsetMil.z,
            scale: PcbScene3dExternalPlacementBuilder.#resolveModelScale(
                modelTransform
            )
        }
    }

    /**
     * Normalizes one KiCad model angle without leaking JavaScript negative zero.
     * @param {number | string | undefined} value Raw angle.
     * @returns {number}
     */
    static #normalizeModelAngle(value) {
        const angle = Number(value || 0)
        return Object.is(angle, -0) ? 0 : angle
    }

    /**
     * Resolves model offset components from current and legacy metadata shapes.
     * @param {object | null | undefined} modelTransform Raw model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveModelOffsetMil(modelTransform) {
        const offset = modelTransform?.offsetMil || {}

        return {
            x: Number(offset.x ?? modelTransform?.dxMil ?? 0),
            y: Number(offset.y ?? modelTransform?.dyMil ?? 0),
            z: Number(offset.z ?? modelTransform?.dzMil ?? 0)
        }
    }

    /**
     * Resolves model scale from KiCad metadata.
     * @param {object | null | undefined} modelTransform Raw model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveModelScale(modelTransform) {
        const scale = modelTransform?.scale || {}

        return {
            x: Number(scale.x ?? 1) || 1,
            y: Number(scale.y ?? 1) || 1,
            z: Number(scale.z ?? 1) || 1
        }
    }
}
