import { Camera, LayoutDashboard, PawPrint, UserRound } from "lucide-react";
import type { View } from "../types";

const items: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> = [
  { view: "inicio", label: "Inicio", icon: LayoutDashboard },
  { view: "descubrir", label: "Descubrir", icon: Camera },
  { view: "coleccion", label: "Colección", icon: PawPrint },
  { view: "perfil", label: "Perfil", icon: UserRound },
];

type NavigationProps = {
  currentView: View;
  onNavigate: (view: View) => void;
};

export function Navigation({ currentView, onNavigate }: NavigationProps) {
  return (
    <nav
      className="absolute inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-[1.7rem] border border-forest/10 bg-white/95 p-2 shadow-glow backdrop-blur"
      aria-label="Principal"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = currentView === item.view;
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => onNavigate(item.view)}
            className={`grid min-h-14 place-items-center rounded-2xl text-[11px] font-bold transition ${
              active ? "bg-forest text-white" : "text-forest/65 active:bg-paper"
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
