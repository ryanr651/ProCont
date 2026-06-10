import { cn } from "@/lib/utils";
import procontIcon from "@/assets/procont-logo-icon.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = {
    sm: { icon: 28, text: "text-lg", gap: "gap-1" },
    md: { icon: 38, text: "text-2xl", gap: "gap-1.5" },
    lg: { icon: 52, text: "text-4xl", gap: "gap-2" }
  };

  const config = sizeConfig[size];

  return (
    <div className={cn("flex items-center", config.gap, className)}>
      <img 
        src={procontIcon} 
        alt="KlarCont" 
        style={{ height: config.icon }}
        className="object-contain"
      />
      <span className={cn(
        "font-display font-bold tracking-tight",
        config.text
      )}>
        <span className="text-foreground">Klar</span>
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Cont</span>
      </span>
    </div>
  );
}
