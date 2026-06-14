// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds copper-surface keepouts used to clip 3D silkscreen artwork.
 */
export class PcbScene3dSilkscreenCutoutBuilder {
    static #CIRCLE_SEGMENTS = 32
    static #ROUNDED_RECT_CORNER_SEGMENTS = 5
    static #PAD_SHAPE_CIRCLE = 1
    static #PAD_SHAPE_RECTANGULAR = 2
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Builds visible copper keepouts for one silkscreen side.
     * @param {object[]} pads Mapped pad rows.
     * @param {object[]} vias Mapped via rows.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ x: number, y: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, points: { x: number, y: number }[] }[]}
     */
    static buildSideCutouts(pads, vias, side) {
        return [
            ...PcbScene3dSilkscreenCutoutBuilder.#buildPadCutouts(pads, side),
            ...PcbScene3dSilkscreenCutoutBuilder.#buildViaCutouts(vias)
        ]
    }

    /**
     * Builds visible copper keepouts for pads on one side.
     * @param {object[]} pads Mapped pad rows.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ x: number, y: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, points: { x: number, y: number }[] }[]}
     */
    static #buildPadCutouts(pads, side) {
        return (Array.isArray(pads) ? pads : [])
            .map((pad) =>
                PcbScene3dSilkscreenCutoutBuilder.#buildPadCutout(pad, side)
            )
            .filter(Boolean)
    }

    /**
     * Builds one visible pad copper keepout.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ x: number, y: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, points: { x: number, y: number }[] } | null}
     */
    static #buildPadCutout(pad, side) {
        if (
            !PcbScene3dSilkscreenCutoutBuilder.#hasVisiblePadSurface(pad, side)
        ) {
            return null
        }

        const spec = PcbScene3dSilkscreenCutoutBuilder.#resolvePadSurfaceSpec(
            pad,
            side
        )
        const center = {
            x: Number(pad?.x || 0) + spec.offsetX,
            y: Number(pad?.y || 0) + spec.offsetY
        }
        const points = PcbScene3dSilkscreenCutoutBuilder.#transformPoints(
            PcbScene3dSilkscreenCutoutBuilder.#buildPadLocalPoints(spec),
            center,
            Number(pad?.rotation || 0)
        )

        return PcbScene3dSilkscreenCutoutBuilder.#buildCutout(center, points)
    }

    /**
     * Resolves the visible copper face spec for one pad.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ width: number, height: number, shape: number, cornerRadius: number, offsetX: number, offsetY: number }}
     */
    static #resolvePadSurfaceSpec(pad, side) {
        const size = PcbScene3dSilkscreenCutoutBuilder.#resolvePadSurfaceSize(
            pad,
            side
        )
        const shape = PcbScene3dSilkscreenCutoutBuilder.#resolvePadShape(
            pad,
            side
        )

        return {
            ...size,
            shape,
            cornerRadius:
                PcbScene3dSilkscreenCutoutBuilder.#resolveCornerRadius(
                    pad,
                    size,
                    shape,
                    side
                ),
            ...PcbScene3dSilkscreenCutoutBuilder.#resolvePadOffset(pad, side)
        }
    }

    /**
     * Resolves the visible copper dimensions for one pad face.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ width: number, height: number }}
     */
    static #resolvePadSurfaceSize(pad, side) {
        const preferredWidth =
            side === 'bottom'
                ? Number(pad?.sizeBottomX || 0)
                : Number(pad?.sizeTopX || 0)
        const preferredHeight =
            side === 'bottom'
                ? Number(pad?.sizeBottomY || 0)
                : Number(pad?.sizeTopY || 0)
        const width =
            Number(
                preferredWidth ||
                    pad?.sizeMidX ||
                    (side === 'bottom' ? pad?.sizeTopX : pad?.sizeBottomX) ||
                    0
            ) || 0
        const height =
            Number(
                preferredHeight ||
                    pad?.sizeMidY ||
                    (side === 'bottom' ? pad?.sizeTopY : pad?.sizeBottomY) ||
                    0
            ) || 0
        const holeDiameter = Number(pad?.holeDiameter || 0)

        return {
            width: width > 0 ? Math.max(width, holeDiameter, 0) : 0,
            height: height > 0 ? Math.max(height, holeDiameter, 0) : 0
        }
    }

    /**
     * Resolves a side-specific pad copper offset.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {{ offsetX: number, offsetY: number }}
     */
    static #resolvePadOffset(pad, side) {
        if (side === 'bottom') {
            return {
                offsetX: Number(pad?.offsetBottomX ?? pad?.offsetTopX ?? 0),
                offsetY: Number(pad?.offsetBottomY ?? pad?.offsetTopY ?? 0)
            }
        }

        return {
            offsetX: Number(pad?.offsetTopX ?? pad?.offsetBottomX ?? 0),
            offsetY: Number(pad?.offsetTopY ?? pad?.offsetBottomY ?? 0)
        }
    }

    /**
     * Resolves the effective pad shape code for one face.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {number}
     */
    static #resolvePadShape(pad, side) {
        if (side === 'bottom') {
            if (
                pad?.hasRoundedRect &&
                Number.isInteger(pad?.roundedRectShapeBottom)
            ) {
                return Number(pad.roundedRectShapeBottom)
            }

            return Number(
                pad?.shapeBottom || pad?.shapeMid || pad?.shapeTop || 0
            )
        }

        if (pad?.hasRoundedRect && Number.isInteger(pad?.roundedRectShapeTop)) {
            return Number(pad.roundedRectShapeTop)
        }

        return Number(pad?.shapeTop || pad?.shapeMid || pad?.shapeBottom || 0)
    }

    /**
     * Resolves the visible rounded-rectangle corner radius.
     * @param {object} pad Mapped pad row.
     * @param {{ width: number, height: number }} size Surface size.
     * @param {number} shape Pad shape code.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {number}
     */
    static #resolveCornerRadius(pad, size, shape, side) {
        const rawCornerRadius =
            side === 'bottom'
                ? Number(pad?.cornerRadiusBottom)
                : Number(pad?.cornerRadiusTop)
        if (
            pad?.hasRoundedRect &&
            Number.isFinite(rawCornerRadius) &&
            rawCornerRadius > 0
        ) {
            return Math.min(size.width, size.height) * (rawCornerRadius / 100)
        }

        return shape === 4 ? Math.min(size.width, size.height) * 0.25 : 0
    }

    /**
     * Builds local pad outline points around the face origin.
     * @param {{ width: number, height: number, shape: number, cornerRadius: number }} spec
     * Pad surface spec.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildPadLocalPoints(spec) {
        if (
            spec.shape !==
                PcbScene3dSilkscreenCutoutBuilder.#PAD_SHAPE_RECTANGULAR &&
            Math.abs(Number(spec.width) - Number(spec.height)) <
                PcbScene3dSilkscreenCutoutBuilder.#GEOMETRY_EPSILON
        ) {
            return PcbScene3dSilkscreenCutoutBuilder.#buildCirclePoints(
                { x: 0, y: 0 },
                Math.max(Number(spec.width || 0), Number(spec.height || 0)) / 2
            )
        }

        if (Number(spec.cornerRadius || 0) > 0) {
            return PcbScene3dSilkscreenCutoutBuilder.#buildRoundedRectPoints(
                spec.width,
                spec.height,
                spec.cornerRadius
            )
        }

        return PcbScene3dSilkscreenCutoutBuilder.#buildRectanglePoints(
            spec.width,
            spec.height
        )
    }

    /**
     * Builds visible copper keepouts for vias.
     * @param {object[]} vias Mapped via rows.
     * @returns {{ x: number, y: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, points: { x: number, y: number }[] }[]}
     */
    static #buildViaCutouts(vias) {
        return (Array.isArray(vias) ? vias : [])
            .map((via) => {
                const diameter = Number(
                    via?.diameter || via?.outerDiameter || 0
                )
                const center = {
                    x: Number(via?.x || 0),
                    y: Number(via?.y || 0)
                }

                return PcbScene3dSilkscreenCutoutBuilder.#buildCutout(
                    center,
                    PcbScene3dSilkscreenCutoutBuilder.#buildCirclePoints(
                        center,
                        diameter / 2
                    )
                )
            })
            .filter(Boolean)
    }

    /**
     * Builds an axis-aligned rectangular outline around the origin.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRectanglePoints(width, height) {
        const halfWidth = Math.max(Number(width || 0), 0) / 2
        const halfHeight = Math.max(Number(height || 0), 0) / 2

        return [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ]
    }

    /**
     * Builds a rounded-rectangle outline around the origin.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @param {number} radius Corner radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRoundedRectPoints(width, height, radius) {
        const halfWidth = Math.max(Number(width || 0), 0) / 2
        const halfHeight = Math.max(Number(height || 0), 0) / 2
        const safeRadius = Math.min(
            Math.max(Number(radius || 0), 0),
            halfWidth,
            halfHeight
        )
        if (safeRadius <= PcbScene3dSilkscreenCutoutBuilder.#GEOMETRY_EPSILON) {
            return PcbScene3dSilkscreenCutoutBuilder.#buildRectanglePoints(
                width,
                height
            )
        }

        return [
            ...PcbScene3dSilkscreenCutoutBuilder.#buildCornerPoints(
                halfWidth - safeRadius,
                -halfHeight + safeRadius,
                safeRadius,
                -90,
                0
            ),
            ...PcbScene3dSilkscreenCutoutBuilder.#buildCornerPoints(
                halfWidth - safeRadius,
                halfHeight - safeRadius,
                safeRadius,
                0,
                90
            ),
            ...PcbScene3dSilkscreenCutoutBuilder.#buildCornerPoints(
                -halfWidth + safeRadius,
                halfHeight - safeRadius,
                safeRadius,
                90,
                180
            ),
            ...PcbScene3dSilkscreenCutoutBuilder.#buildCornerPoints(
                -halfWidth + safeRadius,
                -halfHeight + safeRadius,
                safeRadius,
                180,
                270
            )
        ]
    }

    /**
     * Builds one rounded-rectangle corner arc.
     * @param {number} cx Corner center X.
     * @param {number} cy Corner center Y.
     * @param {number} radius Corner radius.
     * @param {number} startAngle Start angle in degrees.
     * @param {number} endAngle End angle in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCornerPoints(cx, cy, radius, startAngle, endAngle) {
        return Array.from(
            {
                length:
                    PcbScene3dSilkscreenCutoutBuilder
                        .#ROUNDED_RECT_CORNER_SEGMENTS + 1
            },
            (_, index) => {
                const fraction =
                    index /
                    PcbScene3dSilkscreenCutoutBuilder
                        .#ROUNDED_RECT_CORNER_SEGMENTS
                const angle =
                    ((startAngle + (endAngle - startAngle) * fraction) *
                        Math.PI) /
                    180

                return {
                    x: cx + Math.cos(angle) * radius,
                    y: cy + Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Builds circular outline points.
     * @param {{ x: number, y: number }} center Center point.
     * @param {number} radius Circle radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCirclePoints(center, radius) {
        const safeRadius = Math.max(Number(radius || 0), 0)
        if (safeRadius <= PcbScene3dSilkscreenCutoutBuilder.#GEOMETRY_EPSILON) {
            return []
        }

        return Array.from(
            { length: PcbScene3dSilkscreenCutoutBuilder.#CIRCLE_SEGMENTS },
            (_, index) => {
                const angle =
                    (Math.PI * 2 * index) /
                    PcbScene3dSilkscreenCutoutBuilder.#CIRCLE_SEGMENTS

                return {
                    x: Number(center?.x || 0) + Math.cos(angle) * safeRadius,
                    y: Number(center?.y || 0) + Math.sin(angle) * safeRadius
                }
            }
        )
    }

    /**
     * Rotates local points and translates them into board space.
     * @param {{ x: number, y: number }[]} points Local points.
     * @param {{ x: number, y: number }} center Board-space center.
     * @param {number} rotationDeg Rotation angle.
     * @returns {{ x: number, y: number }[]}
     */
    static #transformPoints(points, center, rotationDeg) {
        const angle = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        return points.map((point) => ({
            x: Number(center.x || 0) + point.x * cos - point.y * sin,
            y: Number(center.y || 0) + point.x * sin + point.y * cos
        }))
    }

    /**
     * Wraps a polygon and its bounds as one cutout row.
     * @param {{ x: number, y: number }} center Cutout center.
     * @param {{ x: number, y: number }[]} points Cutout points.
     * @returns {{ x: number, y: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, points: { x: number, y: number }[] } | null}
     */
    static #buildCutout(center, points) {
        const finitePoints = (Array.isArray(points) ? points : []).filter(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
        )
        if (finitePoints.length < 3) {
            return null
        }

        return {
            x: Number(center.x || 0),
            y: Number(center.y || 0),
            points: finitePoints,
            bounds: PcbScene3dSilkscreenCutoutBuilder.#resolvePointBounds(
                finitePoints
            )
        }
    }

    /**
     * Returns true when one pad has a visible copper face.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {boolean}
     */
    static #hasVisiblePadSurface(pad, side) {
        const maskOpening =
            PcbScene3dSilkscreenCutoutBuilder.#resolveSolderMaskOpening(
                pad,
                side
            )
        if (maskOpening === false) {
            return false
        }

        const preferredSideHasSize =
            PcbScene3dSilkscreenCutoutBuilder.#hasSideSize(pad, side)
        if (preferredSideHasSize) {
            return true
        }

        const alternateSideHasSize =
            PcbScene3dSilkscreenCutoutBuilder.#hasSideSize(
                pad,
                side === 'bottom' ? 'top' : 'bottom'
            )
        const midHasSize =
            Number(pad?.sizeMidX || 0) > 0 || Number(pad?.sizeMidY || 0) > 0

        return !alternateSideHasSize && midHasSize
    }

    /**
     * Resolves an explicit side-specific solder-mask opening.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {boolean | null}
     */
    static #resolveSolderMaskOpening(pad, side) {
        const fieldName =
            side === 'bottom'
                ? 'hasBottomSolderMaskOpening'
                : 'hasTopSolderMaskOpening'

        return typeof pad?.[fieldName] === 'boolean' ? pad[fieldName] : null
    }

    /**
     * Returns true when one face has an explicit copper size.
     * @param {object} pad Mapped pad row.
     * @param {'top' | 'bottom'} side Silkscreen side.
     * @returns {boolean}
     */
    static #hasSideSize(pad, side) {
        if (side === 'bottom') {
            return (
                Number(pad?.sizeBottomX || 0) > 0 ||
                Number(pad?.sizeBottomY || 0) > 0
            )
        }

        return Number(pad?.sizeTopX || 0) > 0 || Number(pad?.sizeTopY || 0) > 0
    }

    /**
     * Resolves axis-aligned bounds for one cutout point list.
     * @param {{ x: number, y: number }[]} points Cutout points.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static #resolvePointBounds(points) {
        const xs = points.map((point) => point.x)
        const ys = points.map((point) => point.y)

        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys)
        }
    }
}
