"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = Omit<ComponentProps<typeof Button>, "children"> & {
  label: string;
  icon: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
};

/** Icon-only button with an accessible label shown as a tooltip. */
export function IconButton({ label, icon, side = "bottom", size = "icon", ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size={size} aria-label={label} {...props} />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
