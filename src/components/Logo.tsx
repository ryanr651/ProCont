import { cn } from "@/lib/utils";
import procontLogo from "@/assets/procont-logo.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "h-6",
    md: "h-10",
    lg: "h-14"
  };

  return (
    <div className={cn("flex items-center", className)}>
      <img 
        src={procontLogo} 
        alt="ProCont Logo" 
        className={cn("object-contain", sizeClasses[size])}
      />
    </div>
  );
}
