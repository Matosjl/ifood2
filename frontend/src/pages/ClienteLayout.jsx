// Layout shell do app cliente — fundo escuro + bottom nav fixa
import { Outlet } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";

export default function ClienteLayout() {
  return (
    <div className="min-h-screen bg-[#080808] text-white pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
