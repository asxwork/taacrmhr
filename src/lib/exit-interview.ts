// Exit interview questions. Client-safe (askForExitInterview is server-only: import it from server code).
export const EXIT_REASONS = ["Better pay elsewhere", "Career growth", "Manager", "Work hours / workload", "Commute / relocation", "Studies", "Family / personal", "Health", "Company direction", "Other"];
export const EXIT_RATINGS = [["manager", "My manager"], ["team", "My team"], ["pay", "Pay & benefits"], ["growth", "Growth & learning"], ["balance", "Work-life balance"], ["company", "The company overall"]] as const;
