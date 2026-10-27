// Type declarations for engine.js (the shared rules engine).
// The game object is plain JSON; these types describe the parts the UI and server read.

export type Phase = 'roll' | 'act' | 'end' | null;
export type RoomStatus = 'lobby' | 'playing' | 'ended' | 'closed';

export interface LobbyPlayer { id: string; nick: string; av: number; ready: boolean; bot?: boolean }
export interface OwnedAsset { k: string; id: string }
export interface PlayerState {
  nick: string; av: number; bot: boolean; pos: number;
  cash: number; sav: number; debt: number; hap: number;
  career: string; sal: number; liv: number; promos: number;
  assets: OwnedAsset[]; skip: number; bk: number; laps: number; ins: boolean;
}
export interface LogEntry { n: number; p: string | null; t: string; d: number }
export interface ChatEntry { p: string; i: number; t: number }
export type QueueItem =
  | { k: 'card'; id: string }
  | { k: 'pay'; amt: number; why: string }
  | { k: 'invest'; offers: string[] }
  | { k: 'career' };

export interface Game {
  code: string; hostId: string | null; status: RoomStatus; v: number; at?: number; by?: string;
  cfg: { rounds: number };
  players: LobbyPlayer[]; chat: ChatEntry[]; log: LogEntry[]; gameId: string;
  order?: string[]; ps?: Record<string, PlayerState>; market?: Record<string, number>; infl?: number;
  decks?: Record<string, { o: string[]; i: number }>;
  turnIdx?: number; round?: number; turnNo?: number; phase?: Phase; q?: QueueItem[];
  dice?: [number, number] | null; move?: { p: string; from: number; to: number; steps: number; k: string } | null;
  extra?: boolean; reveals?: Record<string, string>; startedAt?: number;
  [key: string]: unknown;
}

export interface Option { l: string; sub?: string; ok: boolean; def?: boolean; run: () => unknown }
export interface Space { n: string; t: string; card?: string }
export interface CardDef { id: string; cat: string; title: string; desc: string; fx: unknown[]; ch: { l: string; fx: unknown[]; m?: string }[] | null }
export interface Career { name: string; ic: string; sal: number; liv: number; debt?: number; promo?: string; up?: number; chance: number; var?: [number, number]; safe?: boolean; note?: string }
export interface AssetDef { name: string; ic: string; price: number; inc: number; kpr?: number }
export interface GoalDef { name: string; desc: string; test: (p: PlayerState, nw: number) => boolean }
export interface ResultRow {
  id: string; p: PlayerState; nw: number; assetsV: number; total: number;
  parts: { wealth: number; hap: number; career: number; goal: number; debtFree: number; bk: number };
  goalKey: string | null; goalMet: boolean; title: string;
}

export class GameError extends Error {}
export const A: Record<string, (g: Game, me: string, ...args: any[]) => void>;
export const BOARD: Space[];
export const SPACE_TYPES: Record<string, { lab: string; ic: string }>;
export const CARDS: Record<string, CardDef>;
export const CATS: Record<string, string>;
export const CAREERS: Record<string, Career>;
export const ASSETS: Record<string, AssetDef>;
export const GOALS: Record<string, GoalDef>;
export const TITLES: Record<string, [string, string]>;
export const BOTS: [string, number][];
export const CHAT_PRESETS: string[];
export const AVATARS: string[];
export const DECK_CATS: string[];
export const START_CASH: number;
export function computeResults(g: Game): ResultRow[];
export function optionsFor(g: Game, pid: string, item: QueueItem): Option[];
export function netWorth(g: Game, p: PlayerState): number;
export function assetValue(g: Game, key: string): number;
export function creditLimit(p: PlayerState): number;
export function nameOf(g: Game, pid: string | null | undefined): string;
export function avOf(g: Game, pid: string): string;
export function rp(n: number): string;
export function rpShort(n: number): string;
export function rnd(n: number): number;
export function mkCode(): string;
export function mkId(n?: number): string;
export function dealGoals(g: Game): Record<string, string>;
export function botChoose(g: Game, id: string): number;
