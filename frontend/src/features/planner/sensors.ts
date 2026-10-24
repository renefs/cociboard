import {
  PointerSensor,
  type PointerSensorOptions,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Pointer sensor for mouse and pen. Touch input is left to the TouchSensor (press and
 * hold), so a plain swipe still scrolls the page instead of starting a drag.
 */
export class MouseAndPenSensor extends PointerSensor {
  static override activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions,
      ): boolean => {
        if (nativeEvent.pointerType === "touch" || !nativeEvent.isPrimary || nativeEvent.button !== 0) {
          return false;
        }
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

export const POINTER_ACTIVATION = { distance: 6 } as const;
export const TOUCH_ACTIVATION = { delay: 200, tolerance: 5 } as const;

/** Pointer position decides the target; keyboard drags (no pointer) use the closest centre. */
export const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
