import {
  AlarmClock, Archive, Sparkles, Award, Banknote, BarChart3, Briefcase, Building2, CalendarDays, CheckSquare, ClipboardList, Clock, Contact, CreditCard, Fingerprint, Handshake,
  Crown, Gauge, History, Workflow, House, Landmark, LayoutDashboard, LayoutGrid, Network, FileCheck2, RefreshCw, LogOut, Heart, Sheet, Ticket, Scale, Percent,
  Puzzle, List, Ban, Plus, Mail, Sofa, Timer, Coffee, MessageSquarePlus, FileText, FilePlus2, Bell, PhoneCall, Laptop, PieChart, Plane, Plug, Receipt, Settings, Shield, SlidersHorizontal, Target, TreePalm, TrendingUp, User, UserCog, Users, Wallet,
} from "lucide-react";

/** Icon for each nav item (src/lib/nav.ts `icon`). Shared by the sidebar and the Ctrl+K search. Every page has its own. */
export const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House, target: Target, handshake: Handshake, contact: Contact, calendar: CalendarDays, building: Building2,
  chart: BarChart3, pie: PieChart, users: Users, clock: Clock, plane: Plane, wallet: Wallet, briefcase: Briefcase, trending: TrendingUp,
  receipt: Receipt, laptop: Laptop, user: User, check: CheckSquare, fingerprint: Fingerprint, palm: TreePalm, banknote: Banknote,
  card: CreditCard, award: Award, usercog: UserCog, shield: Shield, landmark: Landmark, settings: Settings, sliders: SlidersHorizontal,
  clipboard: ClipboardList, plug: Plug, history: History, phonecall: PhoneCall, gauge: Gauge, workflow: Workflow, crown: Crown, layout: LayoutDashboard, apps: LayoutGrid,
  hierarchy: Network, filecheck: FileCheck2, refresh: RefreshCw, doorout: LogOut, heart: Heart, sheet: Sheet, ticket: Ticket, scale: Scale,
  percent: Percent, puzzle: Puzzle, list: List, ban: Ban, plus: Plus, mail: Mail, sofa: Sofa, timer: Timer, coffee: Coffee, chatplus: MessageSquarePlus, file: FileText, fileplus: FilePlus2, bell: Bell,
  alarm: AlarmClock, sparkles: Sparkles, archive: Archive,
};
