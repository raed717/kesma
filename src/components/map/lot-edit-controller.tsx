"use client";

import type { MapLayerMouseEvent as MlLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { clampToAreas } from "@/domain/geometry/containment";
import { coordKey, insertVertexOnEdge, moveVertex, removeVertex } from "@/domain/geometry/topology";
import type { AreaGeometry, Position } from "@/domain/model/geojson";
import type { Lot } from "@/domain/model/project";
import { useMapUiStore } from "@/store/map-ui-store";
import { LOT_MIDPOINT_LAYER, LOT_VERTEX_LAYER } from "./lots-layer";
import { snapPosition, snapTargetsFrom, type SnapTargets } from "./snap";

type Props = {
  scenarioId: string;
  lots: Lot[];
  /** Property boundary, always a snap target. */
  propertyTargets: SnapTargets;
  /** Lots must stay inside these areas (the property parcels). */
  property: AreaGeometry[];
  onCommit: (lots: Lot[]) => void;
  /** Called when an edit is refused because a lot would leave the property. */
  onRejected?: () => void;
};

type Drag = {
  key: string;
  base: Lot[];
  latest: Lot[];
  moved: boolean;
  targets: SnapTargets;
  /** Outside-the-property area of each lot at drag start (see exitsProperty). */
  outsideCache: Map<string, number>;
};

type LotOps = typeof import("@/domain/lot-operations");

/**
 * Topology-aware vertex editing on MapLibre events (mounted while lots are editable):
 * - drag a vertex: moves it in every lot sharing it (boundaries stay shared);
 * - drag a midpoint: inserts a vertex on that edge (in both lots of a shared edge);
 * - right-click a vertex: removes it; Escape during a drag cancels it.
 * The live result goes to the lot draft (areas update while dragging); it is saved on release.
 *
 * Lots are kept inside the property: a dragged vertex is clamped onto the property boundary,
 * and a move that would make any lot extend further outside (e.g. an edge cutting across a
 * concave notch) is refused — the vertex stays at its last valid position.
 */
export function LotEditController({
  scenarioId,
  lots,
  propertyTargets,
  property,
  onCommit,
  onRejected,
}: Props) {
  const { current: mapRef } = useMap();
  const state = useRef({ lots, propertyTargets, property, onCommit, onRejected, scenarioId });
  useEffect(() => {
    state.current = { lots, propertyTargets, property, onCommit, onRejected, scenarioId };
  });
  // JSTS-backed checks, loaded once editing starts (needed synchronously during drags).
  const ops = useRef<LotOps | null>(null);
  useEffect(() => {
    void import("@/domain/lot-operations").then((m) => (ops.current = m));
  }, []);

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    const canvas = map.getCanvas();
    const setDraft = useMapUiStore.getState().setLotDraft;
    let drag: Drag | null = null;

    const targetsExcluding = (base: Lot[], key: string): SnapTargets => {
      // Snap to other vertices and to edges not attached to the dragged vertex.
      const rings = base.flatMap((l) => l.geometry.coordinates);
      const own = snapTargetsFrom(rings);
      const vertices = own.vertices.filter((v) => coordKey(v) !== key);
      const segments = own.segments.filter(([a, b]) => coordKey(a) !== key && coordKey(b) !== key);
      return {
        vertices: [...state.current.propertyTargets.vertices, ...vertices],
        segments: [...state.current.propertyTargets.segments, ...segments],
      };
    };

    const start = (key: string, base: Lot[]) => {
      drag = {
        key,
        base,
        latest: base,
        moved: false,
        targets: targetsExcluding(base, key),
        outsideCache: new Map(),
      };
      map.dragPan.disable();
      canvas.style.cursor = "grabbing";
    };

    const end = (commit: boolean) => {
      if (!drag) return;
      const { latest, moved, base } = drag;
      drag = null;
      map.dragPan.enable();
      canvas.style.cursor = "";
      setDraft(null);
      if (commit && (moved || latest !== state.current.lots || base !== state.current.lots)) {
        state.current.onCommit(latest);
      }
    };

    const onVertexDown = (e: MlLayerMouseEvent) => {
      if (e.originalEvent.button !== 0 || drag) return;
      const f = e.features?.[0];
      if (!f || f.properties?.locked) return;
      e.preventDefault();
      start(String(f.properties.key), state.current.lots);
    };

    const onMidpointDown = (e: MlLayerMouseEvent) => {
      if (e.originalEvent.button !== 0 || drag) return;
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      e.preventDefault();
      const point = f.geometry.coordinates as Position;
      const base = insertVertexOnEdge(
        state.current.lots,
        String(f.properties.a),
        String(f.properties.b),
        point,
      );
      start(coordKey(point), base);
      drag!.latest = base;
      setDraft({ scenarioId: state.current.scenarioId, lots: base });
    };

    const onMove = (e: MapMouseEvent) => {
      if (!drag) return;
      const { property } = state.current;
      const snapped = snapPosition(map, [e.lngLat.lng, e.lngLat.lat], drag.targets);
      const target = clampToAreas(snapped.position, property);
      const candidate = moveVertex(drag.base, drag.key, target);
      if (ops.current?.exitsProperty(drag.base, candidate, property, drag.outsideCache)) {
        canvas.style.cursor = "not-allowed";
        return; // keep the last valid position
      }
      canvas.style.cursor = "grabbing";
      drag.latest = candidate;
      drag.moved = true;
      setDraft({ scenarioId: state.current.scenarioId, lots: drag.latest });
    };

    const onUp = () => end(true);

    const onVertexContextMenu = (e: MlLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.properties?.locked) return;
      e.preventDefault();
      const { lots: current, property } = state.current;
      const next = removeVertex(current, String(f.properties.key));
      if (next === current) return;
      if (ops.current?.exitsProperty(current, next, property)) {
        state.current.onRejected?.();
        return;
      }
      state.current.onCommit(next);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && drag) {
        drag.latest = state.current.lots;
        end(false);
      }
    };

    const hoverOn = () => {
      if (!drag) canvas.style.cursor = "move";
    };
    const hoverOff = () => {
      if (!drag) canvas.style.cursor = "";
    };

    map.on("mousedown", LOT_VERTEX_LAYER, onVertexDown);
    map.on("mousedown", LOT_MIDPOINT_LAYER, onMidpointDown);
    map.on("contextmenu", LOT_VERTEX_LAYER, onVertexContextMenu);
    map.on("mouseenter", LOT_VERTEX_LAYER, hoverOn);
    map.on("mouseleave", LOT_VERTEX_LAYER, hoverOff);
    map.on("mouseenter", LOT_MIDPOINT_LAYER, hoverOn);
    map.on("mouseleave", LOT_MIDPOINT_LAYER, hoverOff);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      end(false);
      map.off("mousedown", LOT_VERTEX_LAYER, onVertexDown);
      map.off("mousedown", LOT_MIDPOINT_LAYER, onMidpointDown);
      map.off("contextmenu", LOT_VERTEX_LAYER, onVertexContextMenu);
      map.off("mouseenter", LOT_VERTEX_LAYER, hoverOn);
      map.off("mouseleave", LOT_VERTEX_LAYER, hoverOff);
      map.off("mouseenter", LOT_MIDPOINT_LAYER, hoverOn);
      map.off("mouseleave", LOT_MIDPOINT_LAYER, hoverOff);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [mapRef]);

  return null;
}
