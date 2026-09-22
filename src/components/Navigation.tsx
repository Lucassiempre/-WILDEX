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
      className="absolute inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-panel"
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
            className={`grid min-h-14 place-items-center rounded-lg text-[11px] font-semibold transition ${
              active ? "bg-soft text-accent" : "text-secondary active:bg-soft"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
