/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as audit from "../audit.js";
import type * as billing from "../billing.js";
import type * as calls from "../calls.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as demoData from "../demoData.js";
import type * as disputes from "../disputes.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as lib_clock from "../lib/clock.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_stt from "../lib/stt.js";
import type * as lib_twilio from "../lib/twilio.js";
import type * as lib_wav from "../lib/wav.js";
import type * as messages from "../messages.js";
import type * as messaging from "../messaging.js";
import type * as moderation from "../moderation.js";
import type * as orderDesk from "../orderDesk.js";
import type * as orderEdits from "../orderEdits.js";
import type * as orders from "../orders.js";
import type * as owner from "../owner.js";
import type * as prices from "../prices.js";
import type * as recordings from "../recordings.js";
import type * as reminders from "../reminders.js";
import type * as seed from "../seed.js";
import type * as shops from "../shops.js";
import type * as transcription from "../transcription.js";
import type * as transcripts from "../transcripts.js";
import type * as translate from "../translate.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  audit: typeof audit;
  billing: typeof billing;
  calls: typeof calls;
  catalog: typeof catalog;
  crons: typeof crons;
  demoData: typeof demoData;
  disputes: typeof disputes;
  http: typeof http;
  ledger: typeof ledger;
  "lib/clock": typeof lib_clock;
  "lib/hash": typeof lib_hash;
  "lib/phone": typeof lib_phone;
  "lib/stt": typeof lib_stt;
  "lib/twilio": typeof lib_twilio;
  "lib/wav": typeof lib_wav;
  messages: typeof messages;
  messaging: typeof messaging;
  moderation: typeof moderation;
  orderDesk: typeof orderDesk;
  orderEdits: typeof orderEdits;
  orders: typeof orders;
  owner: typeof owner;
  prices: typeof prices;
  recordings: typeof recordings;
  reminders: typeof reminders;
  seed: typeof seed;
  shops: typeof shops;
  transcription: typeof transcription;
  transcripts: typeof transcripts;
  translate: typeof translate;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
