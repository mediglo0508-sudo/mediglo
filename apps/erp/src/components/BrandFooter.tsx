import hmuLogo from "@/assets/hmu-logo.png";

/**
 * Discreet, permanent HMU signature pinned at the bottom of the app shell.
 * Intentionally low-contrast and small so it never competes with data.
 */
export function BrandFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`flex items-center justify-center gap-2 border-t border-border/50 px-4 py-2 text-[10px] tracking-wide text-muted-foreground/70 ${className}`}
    >
      <img
        src={hmuLogo}
        alt="HMU Softwares logo"
        loading="lazy"
        width={16}
        height={16}
        className="h-4 w-4 opacity-70"
      />
      <span>HMU Softwares Since 2026</span>
    </footer>
  );
}
