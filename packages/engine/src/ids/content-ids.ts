import { type Brand } from './brand.ts';

/**
 * Every id the engine keys state by.
 *
 * Each has a constructor rather than being cast at the call site. The cast is real but it
 * is confined to this file, so "where does an untrusted string become an id?" has exactly
 * one answer — which is where M5's content loader will add validation (CLAUDE.md 6: ids are
 * snake_case, namespaced by category, and permanent).
 */

export type EventId = Brand<string, 'EventId'>;
export type ChoiceId = Brand<string, 'ChoiceId'>;
export type FlagId = Brand<string, 'FlagId'>;
export type NpcId = Brand<string, 'NpcId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type TraitId = Brand<string, 'TraitId'>;
export type EndingId = Brand<string, 'EndingId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type EdgeId = Brand<string, 'EdgeId'>;
export type RegionId = Brand<string, 'RegionId'>;
export type LanguageId = Brand<string, 'LanguageId'>;
export type RouteId = Brand<string, 'RouteId'>;
export type ComplicationId = Brand<string, 'ComplicationId'>;

export const eventId = (raw: string): EventId => raw as EventId;
export const choiceId = (raw: string): ChoiceId => raw as ChoiceId;
export const flagId = (raw: string): FlagId => raw as FlagId;
export const npcId = (raw: string): NpcId => raw as NpcId;
export const itemId = (raw: string): ItemId => raw as ItemId;
export const traitId = (raw: string): TraitId => raw as TraitId;
export const endingId = (raw: string): EndingId => raw as EndingId;
export const nodeId = (raw: string): NodeId => raw as NodeId;
export const edgeId = (raw: string): EdgeId => raw as EdgeId;
export const regionId = (raw: string): RegionId => raw as RegionId;
export const languageId = (raw: string): LanguageId => raw as LanguageId;
export const routeId = (raw: string): RouteId => raw as RouteId;
export const complicationId = (raw: string): ComplicationId => raw as ComplicationId;
