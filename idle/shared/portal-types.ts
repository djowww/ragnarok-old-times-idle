import type { Catalog } from './types.js';

export type AccountView = { accountId: string; username: string; profileId: string; characterName: string };
export type RegistrationInput = { username: string; characterName: string; gender: 'male' | 'female'; password: string; confirmation: string };
export type LoginInput = { username: string; password: string };
export type PasswordInput = { currentPassword: string; newPassword: string; confirmation: string };
export type NewsSummary = { slug: string; title: string; category: string; publishedAt: string; summary: string };
export type NewsEntry = NewsSummary & { body: string[] };
export type RankingQuery = { category: 'level' | 'zeny' | 'kills'; classId: string | null; page: number; pageSize: number };
export type RankingRow = { rank: number; characterName: string; classId: string; reborn: boolean; baseLevel: number; jobLevel: number; value: number };
export type RankingPage = RankingQuery & { rows: RankingRow[]; total: number; updatedAt: number };
export type PortalStatus = { status: 'ok'; accounts: number; hunting: number; rates: Catalog['rates']; checkedAt: number };
