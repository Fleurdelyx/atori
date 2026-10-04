import atriIcon from "@/assets/atri-icon.png";

/**
 * LogoMark: the ATORI app icon (the pink star-slash mark) wherever the brand
 * appears in the shell. Rendered from the shipped bitmap so the in-app mark
 * always matches the window/taskbar/favicon icons; colors are fixed
 * (independent of the active skin).
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return <img src={atriIcon} alt="ATORI" className={className} draggable={false} />;
}
