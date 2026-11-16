declare module "zkteco-js" {
  export default class Zkteco {
    constructor(ip: string, port: number, timeout: number, inport: number);
    createSocket(cbErr?: (e: unknown) => void, cbClose?: (t: string) => void): Promise<boolean>;
    getInfo(): Promise<{ userCounts: number; logCounts: number; logCapacity: number }>;
    getSerialNumber(): Promise<string>;
    getDeviceName(): Promise<string>;
    getUsers(): Promise<{ data: { uid: number; role: number; name: string; cardno?: number; userId: string | number }[] }>;
    getAttendances(): Promise<{ data: { user_id: string | number; record_time: string }[] }>;
    disconnect(): Promise<void>;
    connectionType: "tcp" | "udp" | null;
    ztcp: { sessionId: number; createSocket(cbErr?: (e: unknown) => void, cbClose?: (t: string) => void): Promise<unknown>; executeCmd(command: number, data: Buffer | string): Promise<Buffer> };
    zudp: { sessionId: number; createSocket(cbErr?: (e: unknown) => void, cbClose?: (t: string) => void): Promise<unknown>; executeCmd(command: number, data: Buffer | string): Promise<Buffer> };
  }
}
