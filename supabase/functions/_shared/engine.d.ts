// Type declarations for engine.js (the shared City Edition rules engine).
// The game object is plain JSON; these types describe the parts the server and tests read.

export type Phase = 'roll' | 'act' | 'end' | null;
export type RoomStatus = 'lobby' | 'jobs' | 'playing' | 'ended' | 'closed';

export interface LobbyPlayer { id: string; nick: string; av: number; ready: boolean; bot?: boolean }
export interface PlayerState {
  nick: string; av: number; bot: boolean; pos: number; cash: number; owe: number;
  job: string | null; jam: number; doubles: number; cards: number; out: boolean;
  [key: string]: unknown;
}
export interface PropState { o: string | null; h: number; m: boolean; [key: string]: unknown }
export interface LogEntry { n: number; p: string | null; t: string; d?: number }
export interface ChatEntry { p: string; i: number; t: number }
export interface QueueItem { k: string; [key: string]: unknown }

export interface Game {
  code: string; hostId: string | null; status: RoomStatus; v: number; at?: number; by?: string;
  cfg: { rounds: number };
  players: LobbyPlayer[]; chat: ChatEntry[]; log: LogEntry[]; gameId: string;
  order?: string[]; ps?: Record<string, PlayerState>; props?: Record<number, PropState>; offers?: Record<string, string[]>;
  fund?: number; decks?: Record<string, { o: string[]; i: number }>;
  turnIdx?: number; round?: number; turnNo?: number; phase?: Phase; q?: QueueItem[];
  dice?: [number, number] | null; endReason?: string | null;
  [key: string]: unknown;
}

export interface Option { l: string; sub?: string; ok: boolean; bk?: boolean; def?: boolean; [key: string]: unknown }
export interface Space { n: string; t: string; [key: string]: unknown }
export interface CardDef { id: string; deck: string; title: string; desc: string; fx?: unknown[]; ch: unknown[] | null }
export interface JobDef { name: string; ic: string; sal: number; pros: string[]; cons: string[]; [key: string]: unknown }
export interface ResultRow { id: string; nw: number; title: string; [key: string]: unknown }

export class GameError extends Error {}
export const A: Record<string, (g: Game, me: string, ...args: any[]) => void>;
export const BOARD: Space[];
export const GROUPS: Record<string, unknown>;
export const SPACE_TYPES: Record<string, { lab: string; ic: string }>;
export const CARDS: Record<string, CardDef>;
export const JOBS: Record<string, JobDef>;
export const BUYABLE: number[];
export const POS: Record<string, number>;
export const TITLES: unknown;
export const BOTS: unknown[];
export const CHAT_PRESETS: string[];
export const AVATARS: unknown[];
export const PCOLORS: string[];
export const JT: number;
export const START_CASH: number;
export function optionsFor(g: Game, me: string, item: QueueItem): Option[];
export function computeResults(g: Game): ResultRow[];
export function netWorth(g: Game, id: string): number;
export function cardMeta(c: CardDef): { scope: 'you' | 'some' | 'all'; tone: string };
export function isLegacy(g: Game): boolean;
export function owned(g: Game, id: string): number[];
export function canBuild(g: Game, id: string, i: number): boolean;
export function houseCost(i: number): number;
export function rnd(n: number): number;
export function mkId(n?: number): string;
export function mkCode(): string;
export function rp(n: number): string;
export function rpShort(n: number): string;
export function botChoose(g: Game, id: string): number;
export const rentFor: (...a: any[]) => number; export const rentDue: (...a: any[]) => number; export const rentTable: (...a: any[]) => number[];
export const baseRent: (...a: any[]) => number; export const buildCost: (...a: any[]) => number; export const buyPrice: (...a: any[]) => number;
export const takeoverPrice: (...a: any[]) => number; export const jamFee: (...a: any[]) => number; export const canSellHouse: (...a: any[]) => boolean;
export const canMortgage: (...a: any[]) => boolean; export const unmortCost: (...a: any[]) => number; export const mortValueFor: (...a: any[]) => number;
export const groupOf: (...a: any[]) => unknown; export const ownsGroup: (...a: any[]) => boolean; export const nameOf: (...a: any[]) => string; export const avOf: (...a: any[]) => unknown;
