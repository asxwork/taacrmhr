import { handshake, receive } from "@/lib/attendance-machine";

// ZKTeco "Cloud Server" (ADMS) endpoint: set the machine's server address to this site.
export const GET = handshake;
export const POST = receive;
