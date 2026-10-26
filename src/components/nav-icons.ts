import {
  Award, Banknote, BarChart3, Briefcase, Building2, CalendarDays, CheckSquare, ClipboardList, Clock, Contact, CreditCard, Fingerprint, Handshake,
  Gauge, History, House, Landmark, PhoneCall, Laptop, PieChart, Plane, Plug, Receipt, Settings, Shield, SlidersHorizontal, Target, TreePalm, TrendingUp, User, UserCog, Users, Wallet,
} from "lucide-react";

/** Icon for each nav item (src/lib/nav.ts `icon`). Shared by the sidebar and the Ctrl+K search. Every page has its own. */
export const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House, target: Target, handshake: Handshake, contact: Contact, calendar: CalendarDays, building: Building2,
  chart: BarChart3, pie: PieChart, users: Users, clock: Clock, plane: Plane, wallet: Wallet, briefcase: Briefcase, trending: TrendingUp,
  receipt: Receipt, laptop: Laptop, user: User, check: CheckSquare, fingerprint: Fingerprint, palm: TreePalm, banknote: Banknote,
  card: CreditCard, award: Award, usercog: UserCog, shield: Shield, landmark: Landmark, settings: Settings, sliders: SlidersHorizontal,
  clipboard: ClipboardList, plug: Plug, history: History, phonecall: PhoneCall, gauge: Gauge,
};
