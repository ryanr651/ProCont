import { cn } from "@/lib/utils";
import procontIcon from "@/assets/procont-icon.jpg";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = {
    sm: { icon: 28, text: "text-lg" },
    md: { icon: 40, text: "text-2xl" },
    lg: { icon: 56, text: "text-4xl" }
  };

  const config = sizeConfig[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img 
        src={procontIcon} 
        alt="ProCont" 
        style={{ height: config.icon }}
        className="object-contain"
      />
      <span className={cn(
        "font-display font-bold tracking-tight",
        config.text
      )}>
        <span className="text-foreground">Pro</span>
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Cont</span>
      </span>
    </div>
  );
}
