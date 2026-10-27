import { SoftphoneProvider } from "@/components/calls/softphone";

/** Every Calls page shares one softphone, so it stays registered (and can ring) while agents move between pages. */
export default function CallsLayout({ children }: { children: React.ReactNode }) {
  return <SoftphoneProvider>{children}</SoftphoneProvider>;
}
