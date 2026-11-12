"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import * as React from "react";
import { cn } from "../../../lib/utils";
import { useIsMobile } from "../../hooks/use-mobile";
import { Button } from "./button";
import { Input } from "./input";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";
import { Skeleton } from "./skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const SIDEBAR_COOKIE_NAME = "sk_ui_sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "20rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

const SidebarProvider = ({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ref,
  ...props
}: (React.ComponentProps<"div"> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) & {
  ref?: React.Ref<HTMLDivElement>;
}) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      // biome-ignore lint/suspicious/noDocumentCookie: changing document cookie is allowed in playgrounds
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ isMobile, open, openMobile, setOpen, setOpenMobile, state, toggleSidebar }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          className={cn(
            "sk-ui-group/sidebar-wrapper sk-ui-flex sk-ui-min-h-svh sk-ui-w-full sk-ui-has-[[data-variant=inset]]:sk-ui-bg-sidebar",
            className,
          )}
          ref={ref}
          style={
            {
              "--sk-ui-sidebar-width": SIDEBAR_WIDTH,
              "--sk-ui-sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          {...props}>
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
};
SidebarProvider.displayName = "SidebarProvider";

const Sidebar = ({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ref,
  ...props
}: (React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) & { ref?: React.Ref<HTMLDivElement> }) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "sk-ui-flex sk-ui-h-full sk-ui-w-[--sk-ui-sidebar-width] sk-ui-flex-col sk-ui-bg-sidebar sk-ui-text-sidebar-foreground",
          className,
        )}
        ref={ref}
        {...props}>
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile} {...props}>
        <SheetContent
          className="sk-ui-w-[--sk-ui-sidebar-width] sk-ui-bg-sidebar sk-ui-p-0 sk-ui-text-sidebar-foreground [&>button]:sk-ui-hidden"
          data-mobile="true"
          data-sidebar="sidebar"
          side={side}
          style={{ "--sk-ui-sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}>
          <SheetHeader className="sk-ui-sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="sk-ui-flex sk-ui-h-full sk-ui-w-full sk-ui-flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="sk-ui-group sk-ui-peer sk-ui-hidden sk-ui-text-sidebar-foreground md:sk-ui-block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-state={state}
      data-variant={variant}
      ref={ref}>
      {/* This is what handles the sidebar gap on desktop */}
      <div
        className={cn(
          "sk-ui-relative sk-ui-w-[--sk-ui-sidebar-width] sk-ui-bg-transparent sk-ui-transition-[width] sk-ui-duration-200 sk-ui-ease-linear",
          "group-data-[collapsible=offcanvas]:sk-ui-w-0",
          "group-data-[side=right]:sk-ui-rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:sk-ui-w-[calc(var(--sk-ui-sidebar-width-icon)_+_theme(spacing.4))]"
            : "group-data-[side=left]:sk-ui-border-r group-data-[side=right]:sk-ui-border-l group-data-[collapsible=icon]:sk-ui-w-[--sk-ui-sidebar-width-icon]",
        )}
      />
      <div
        className={cn(
          "sk-ui-fixed sk-ui-inset-y-0 sk-ui-z-10 sk-ui-hidden sk-ui-h-svh sk-ui-w-[--sk-ui-sidebar-width] sk-ui-transition-[left,right,width] sk-ui-duration-200 sk-ui-ease-linear md:sk-ui-flex",
          side === "left"
            ? "sk-ui-left-0 group-data-[collapsible=offcanvas]:sk-ui-left-[calc(var(--sk-ui-sidebar-width)*-1)]"
            : "sk-ui-right-0 group-data-[collapsible=offcanvas]:sk-ui-right-[calc(var(--sk-ui-sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:sk-ui-w-[calc(var(--sk-ui-sidebar-width-icon)_+_theme(spacing.4)_+2px)] sk-ui-p-2"
            : "group-data-[side=left]:sk-ui-border-r group-data-[side=right]:sk-ui-border-l group-data-[collapsible=icon]:sk-ui-w-[--sk-ui-sidebar-width-icon]",
          className,
        )}
        {...props}>
        <div
          className="sk-ui-flex sk-ui-h-full sk-ui-w-full sk-ui-flex-col sk-ui-bg-sidebar group-data-[variant=floating]:sk-ui-shadow group-data-[variant=floating]:sk-ui-border-sidebar-border group-data-[variant=floating]:sk-ui-border group-data-[variant=floating]:sk-ui-rounded-lg"
          data-sidebar="sidebar">
          {children}
        </div>
      </div>
    </div>
  );
};
Sidebar.displayName = "Sidebar";

const SidebarTrigger = ({
  className,
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof Button> & { ref?: React.Ref<React.ElementRef<typeof Button>> }) => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      className={cn("sk-ui-h-7 sk-ui-w-7", className)}
      data-sidebar="trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      ref={ref}
      size="icon"
      variant="ghost"
      {...props}>
      <PanelLeft />
      <span className="sk-ui-sr-only">Toggle Sidebar</span>
    </Button>
  );
};
SidebarTrigger.displayName = "SidebarTrigger";

const SidebarRail = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"button"> & { ref?: React.Ref<HTMLButtonElement> }) => {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      aria-label="Toggle Sidebar"
      className={cn(
        "sk-ui--translate-x-1/2 sk-ui-absolute sk-ui-inset-y-0 sk-ui-z-20 sk-ui-hidden sk-ui-w-4 sk-ui-transition-all sk-ui-ease-linear after:sk-ui-absolute after:sk-ui-inset-y-0 after:sk-ui-left-1/2 after:sk-ui-w-[2px] hover:after:sk-ui-bg-sidebar-border group-data-[side=right]:sk-ui-left-0 md:sk-ui-flex group-data-[side=left]:-right-4",
        "[[data-side=left]_&]:sk-ui-cursor-w-resize [[data-side=right]_&]:sk-ui-cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:sk-ui-cursor-e-resize [[data-side=right][data-state=collapsed]_&]:sk-ui-cursor-w-resize",
        "group-data-[collapsible=offcanvas]:sk-ui-translate-x-0 group-data-[collapsible=offcanvas]:hover:sk-ui-bg-sidebar group-data-[collapsible=offcanvas]:after:sk-ui-left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:sk-ui--right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:sk-ui--left-2",
        className,
      )}
      data-sidebar="rail"
      onClick={toggleSidebar}
      ref={ref}
      tabIndex={-1}
      title="Toggle Sidebar"
      {...props}
    />
  );
};
SidebarRail.displayName = "SidebarRail";

const SidebarInset = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"main"> & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <main
      className={cn(
        "sk-ui-relative sk-ui-flex sk-ui-w-full sk-ui-flex-1 sk-ui-flex-col sk-ui-bg-background",
        "md:peer-data-[state=collapsed]:peer-data-[variant=inset]:sk-ui-ml-2 md:peer-data-[variant=inset]:sk-ui-m-2 md:peer-data-[variant=inset]:sk-ui-ml-0 md:peer-data-[variant=inset]:sk-ui-rounded-xl md:peer-data-[variant=inset]:sk-ui-shadow",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
};
SidebarInset.displayName = "SidebarInset";

const SidebarInput = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Input> & { ref?: React.Ref<React.ElementRef<typeof Input>> }) => {
  return (
    <Input
      className={cn(
        "sk-ui-h-8 sk-ui-w-full sk-ui-bg-background sk-ui-shadow-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-sidebar-ring",
        className,
      )}
      data-sidebar="input"
      ref={ref}
      {...props}
    />
  );
};
SidebarInput.displayName = "SidebarInput";

const SidebarHeader = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      className={cn(
        "sk-ui-flex sk-ui-h-[--sk-ui-navbar-height] sk-ui-flex-col sk-ui-justify-center sk-ui-gap-2 sk-ui-p-4",
        className,
      )}
      data-sidebar="header"
      ref={ref}
      {...props}
    />
  );
};
SidebarHeader.displayName = "SidebarHeader";

const SidebarFooter = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      className={cn("sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-p-2", className)}
      data-sidebar="footer"
      ref={ref}
      {...props}
    />
  );
};
SidebarFooter.displayName = "SidebarFooter";

const SidebarSeparator = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Separator> & { ref?: React.Ref<React.ElementRef<typeof Separator>> }) => {
  return (
    <Separator
      className={cn("sk-ui-mx-2 sk-ui-w-auto sk-ui-bg-sidebar-border", className)}
      data-sidebar="separator"
      ref={ref}
      {...props}
    />
  );
};
SidebarSeparator.displayName = "SidebarSeparator";

const SidebarContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      className={cn(
        "sk-ui-flex sk-ui-min-h-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-2 sk-ui-overflow-auto group-data-[collapsible=icon]:sk-ui-overflow-hidden",
        className,
      )}
      data-sidebar="content"
      ref={ref}
      {...props}
    />
  );
};
SidebarContent.displayName = "SidebarContent";

const SidebarGroup = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      className={cn("sk-ui-relative sk-ui-flex sk-ui-w-full sk-ui-min-w-0 sk-ui-flex-col sk-ui-p-4", className)}
      data-sidebar="group"
      ref={ref}
      {...props}
    />
  );
};
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = ({
  className,
  asChild = false,
  ref,
  ...props
}: (React.ComponentProps<"div"> & { asChild?: boolean }) & { ref?: React.Ref<HTMLDivElement> }) => {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      className={cn(
        "sk-ui-flex sk-ui-h-8 sk-ui-shrink-0 sk-ui-items-center sk-ui-rounded-md sk-ui-font-medium sk-ui-text-sidebar-foreground sk-ui-text-xs sk-ui-opacity-70 sk-ui-outline-none sk-ui-ring-sidebar-ring sk-ui-transition-[margin,opacity] sk-ui-duration-200 sk-ui-ease-linear focus-visible:sk-ui-ring-2 [&>svg]:sk-ui-size-4 [&>svg]:sk-ui-shrink-0",
        "group-data-[collapsible=icon]:sk-ui--mt-8 group-data-[collapsible=icon]:sk-ui-opacity-0",
        className,
      )}
      data-sidebar="group-label"
      ref={ref}
      {...props}
    />
  );
};
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupAction = ({
  className,
  asChild = false,
  ref,
  ...props
}: (React.ComponentProps<"button"> & { asChild?: boolean }) & { ref?: React.Ref<HTMLButtonElement> }) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "sk-ui-absolute sk-ui-top-3.5 sk-ui-right-3 sk-ui-flex sk-ui-aspect-square sk-ui-w-5 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-md sk-ui-p-0 sk-ui-text-sidebar-foreground sk-ui-outline-none sk-ui-ring-sidebar-ring sk-ui-transition-transform hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground focus-visible:sk-ui-ring-2 [&>svg]:sk-ui-size-4 [&>svg]:sk-ui-shrink-0",
        // Increases the hit area of the button on mobile.
        "after:sk-ui--inset-2 after:sk-ui-absolute after:md:sk-ui-hidden",
        "group-data-[collapsible=icon]:sk-ui-hidden",
        className,
      )}
      data-sidebar="group-action"
      ref={ref}
      {...props}
    />
  );
};
SidebarGroupAction.displayName = "SidebarGroupAction";

const SidebarGroupContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => (
  <div className={cn("sk-ui-w-full sk-ui-text-sm", className)} data-sidebar="group-content" ref={ref} {...props} />
);
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"ul"> & { ref?: React.Ref<HTMLUListElement> }) => (
  <ul
    className={cn("sk-ui-flex sk-ui-w-full sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1", className)}
    data-sidebar="menu"
    ref={ref}
    {...props}
  />
);
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"li"> & { ref?: React.Ref<HTMLLIElement> }) => (
  <li className={cn("sk-ui-group/menu-item sk-ui-relative", className)} data-sidebar="menu-item" ref={ref} {...props} />
);
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
  "sk-ui-peer/menu-button sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-2 sk-ui-overflow-hidden sk-ui-rounded-md sk-ui-p-2 sk-ui-text-left sk-ui-text-sm sk-ui-outline-none sk-ui-ring-sidebar-ring sk-ui-transition-[width,height,padding] hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground focus-visible:sk-ui-ring-2 active:sk-ui-bg-sidebar-accent active:sk-ui-text-sidebar-accent-foreground disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:sk-ui-pr-8 aria-disabled:sk-ui-pointer-events-none aria-disabled:sk-ui-opacity-50 data-[active=true]:sk-ui-bg-sidebar-accent data-[active=true]:sk-ui-font-medium data-[active=true]:sk-ui-text-sidebar-accent-foreground data-[state=open]:hover:sk-ui-bg-sidebar-accent data-[state=open]:hover:sk-ui-text-sidebar-accent-foreground group-data-[collapsible=icon]:!sk-ui-size-8 group-data-[collapsible=icon]:!sk-ui-p-2 [&>span:last-child]:sk-ui-truncate [&>svg]:sk-ui-size-4 [&>svg]:sk-ui-shrink-0",
  {
    defaultVariants: { size: "default", variant: "default" },
    variants: {
      size: {
        default: "sk-ui-h-8 sk-ui-text-sm",
        lg: "sk-ui-h-12 sk-ui-text-sm group-data-[collapsible=icon]:!sk-ui-p-0",
        sm: "sk-ui-h-7 sk-ui-text-xs",
      },
      variant: {
        default: "hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground",
        outline:
          "sk-ui-bg-background sk-ui-shadow-[0_0_0_1px_hsl(var(--sk-ui-sidebar-border))] hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground hover:sk-ui-shadow-[0_0_0_1px_hsl(var(--sk-ui-sidebar-accent))]",
      },
    },
  },
);

const SidebarMenuButton = ({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ref,
  ...props
}: (React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) & { ref?: React.Ref<HTMLButtonElement> }) => {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      className={cn(sidebarMenuButtonVariants({ size, variant }), className)}
      data-active={isActive}
      data-sidebar="menu-button"
      data-size={size}
      ref={ref}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === "string") {
    tooltip = { children: tooltip };
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent align="center" hidden={state !== "collapsed" || isMobile} side="right" {...tooltip} />
    </Tooltip>
  );
};
SidebarMenuButton.displayName = "SidebarMenuButton";

const SidebarMenuAction = ({
  className,
  asChild = false,
  showOnHover = false,
  ref,
  ...props
}: (React.ComponentProps<"button"> & { asChild?: boolean; showOnHover?: boolean }) & {
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "sk-ui-absolute sk-ui-top-1.5 sk-ui-right-1 sk-ui-flex sk-ui-aspect-square sk-ui-w-5 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-md sk-ui-p-0 sk-ui-text-sidebar-foreground sk-ui-outline-none sk-ui-ring-sidebar-ring sk-ui-transition-transform hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground focus-visible:sk-ui-ring-2 peer-hover/menu-button:sk-ui-text-sidebar-accent-foreground [&>svg]:sk-ui-size-4 [&>svg]:sk-ui-shrink-0",
        // Increases the hit area of the button on mobile.
        "after:sk-ui--inset-2 after:sk-ui-absolute after:md:sk-ui-hidden",
        "peer-data-[size=sm]/menu-button:sk-ui-top-1",
        "peer-data-[size=default]/menu-button:sk-ui-top-1.5",
        "peer-data-[size=lg]/menu-button:sk-ui-top-2.5",
        "group-data-[collapsible=icon]:sk-ui-hidden",
        showOnHover &&
          "group-focus-within/menu-item:sk-ui-opacity-100 group-hover/menu-item:sk-ui-opacity-100 data-[state=open]:sk-ui-opacity-100 peer-data-[active=true]/menu-button:sk-ui-text-sidebar-accent-foreground md:sk-ui-opacity-0",
        className,
      )}
      data-sidebar="menu-action"
      ref={ref}
      {...props}
    />
  );
};
SidebarMenuAction.displayName = "SidebarMenuAction";

const SidebarMenuBadge = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) => (
  <div
    className={cn(
      "sk-ui-pointer-events-none sk-ui-absolute sk-ui-right-1 sk-ui-flex sk-ui-h-5 sk-ui-min-w-5 sk-ui-select-none sk-ui-items-center sk-ui-justify-center sk-ui-rounded-md sk-ui-px-1 sk-ui-font-medium sk-ui-text-sidebar-foreground sk-ui-text-xs sk-ui-tabular-nums",
      "peer-hover/menu-button:sk-ui-text-sidebar-accent-foreground peer-data-[active=true]/menu-button:sk-ui-text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:sk-ui-top-1",
      "peer-data-[size=default]/menu-button:sk-ui-top-1.5",
      "peer-data-[size=lg]/menu-button:sk-ui-top-2.5",
      "group-data-[collapsible=icon]:sk-ui-hidden",
      className,
    )}
    data-sidebar="menu-badge"
    ref={ref}
    {...props}
  />
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

const SidebarMenuSkeleton = ({
  className,
  showIcon = false,
  ref,
  ...props
}: (React.ComponentProps<"div"> & { showIcon?: boolean }) & { ref?: React.Ref<HTMLDivElement> }) => {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      className={cn("sk-ui-flex sk-ui-h-8 sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-md sk-ui-px-2", className)}
      data-sidebar="menu-skeleton"
      ref={ref}
      {...props}>
      {showIcon && (
        <Skeleton className="sk-ui-size-4 sk-ui-rounded-md" data-sidebar="menu-skeleton-icon" isLoading={true} />
      )}
      <Skeleton
        className="sk-ui-h-4 sk-ui-max-w-[--skeleton-width] sk-ui-flex-1"
        data-sidebar="menu-skeleton-text"
        style={{ "--skeleton-width": width } as React.CSSProperties}
      />
    </div>
  );
};
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";

const SidebarMenuSub = ({
  className,
  ref,
  ...props
}: React.ComponentProps<"ul"> & { ref?: React.Ref<HTMLUListElement> }) => (
  <ul
    className={cn(
      "sk-ui-mx-3.5 sk-ui-flex sk-ui-min-w-0 sk-ui-translate-x-px sk-ui-flex-col sk-ui-gap-1 sk-ui-border-sidebar-border sk-ui-border-l sk-ui-px-2.5 sk-ui-py-0.5",
      "group-data-[collapsible=icon]:sk-ui-hidden",
      className,
    )}
    data-sidebar="menu-sub"
    ref={ref}
    {...props}
  />
);
SidebarMenuSub.displayName = "SidebarMenuSub";

const SidebarMenuSubItem = ({ ref, ...props }: React.ComponentProps<"li"> & { ref?: React.Ref<HTMLLIElement> }) => (
  <li ref={ref} {...props} />
);
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

const SidebarMenuSubButton = ({
  asChild = false,
  size = "md",
  isActive,
  className,
  ref,
  ...props
}: (React.ComponentProps<"a"> & { asChild?: boolean; size?: "sm" | "md"; isActive?: boolean }) & {
  ref?: React.Ref<HTMLAnchorElement>;
}) => {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      className={cn(
        "sk-ui--translate-x-px sk-ui-flex sk-ui-h-7 sk-ui-min-w-0 sk-ui-items-center sk-ui-gap-2 sk-ui-overflow-hidden sk-ui-rounded-md sk-ui-px-2 sk-ui-text-sidebar-foreground sk-ui-outline-none sk-ui-ring-sidebar-ring hover:sk-ui-bg-sidebar-accent hover:sk-ui-text-sidebar-accent-foreground focus-visible:sk-ui-ring-2 active:sk-ui-bg-sidebar-accent active:sk-ui-text-sidebar-accent-foreground disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50 aria-disabled:sk-ui-pointer-events-none aria-disabled:sk-ui-opacity-50 [&>span:last-child]:sk-ui-truncate [&>svg]:sk-ui-size-4 [&>svg]:sk-ui-shrink-0 [&>svg]:sk-ui-text-sidebar-accent-foreground",
        "data-[active=true]:sk-ui-bg-sidebar-accent data-[active=true]:sk-ui-text-sidebar-accent-foreground",
        size === "sm" && "sk-ui-text-xs",
        size === "md" && "sk-ui-text-sm",
        "group-data-[collapsible=icon]:sk-ui-hidden",
        className,
      )}
      data-active={isActive}
      data-sidebar="menu-sub-button"
      data-size={size}
      ref={ref}
      {...props}
    />
  );
};
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
