import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  Tags,
  Bitcoin,
  PieChart,
  Calendar,
  FileText,
  Link as LinkIcon,
  Store,
  Target,
  Landmark,
  ArrowUpRight,
  Activity,
  Settings2,
  Sparkles,
  Brain,
  Calculator,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_MAIN: NavItem[] = [
  { title: "Visão Geral", href: "/", icon: LayoutDashboard },
  { title: "Transações", href: "/transactions", icon: ArrowLeftRight },
  { title: "Recorrências", href: "/recurring", icon: Calendar },
  { title: "Receitas", href: "/recurring/income", icon: ArrowUpRight },
  { title: "Fluxo de Caixa", href: "/cash-flow", icon: TrendingUp },
];

export const NAV_FINANCE: NavItem[] = [
  { title: "Contas", href: "/accounts", icon: Wallet },
  { title: "Faturas", href: "/bills", icon: Receipt },
  { title: "Categorias", href: "/categories", icon: Tags },
  { title: "Comerciantes", href: "/merchants", icon: Store },
];

export const NAV_INVESTMENTS: NavItem[] = [
  { title: "Portfólio", href: "/portfolio", icon: PieChart },
  { title: "Investimentos", href: "/investments", icon: Landmark },
  { title: "Crypto", href: "/crypto", icon: Bitcoin },
];

export const NAV_PLANNING: NavItem[] = [
  { title: "Insights AI", href: "/insights", icon: Brain },
  { title: "Projeções", href: "/projection", icon: Activity },
  { title: "Cenários", href: "/scenarios", icon: Sparkles },
  { title: "Playground", href: "/playground", icon: Calculator },
  { title: "Metas", href: "/goals", icon: Target },
  { title: "Relatórios", href: "/reports", icon: FileText },
  { title: "Configurações", href: "/settings", icon: Settings2 },
  { title: "Conexões", href: "/connect", icon: LinkIcon },
];
