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
import type * as disputes from "../disputes.js";
import type * as http from "../http.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_stt from "../lib/stt.js";
import type * as lib_twilio from "../lib/twilio.js";
import type * as lib_wav from "../lib/wav.js";
import type * as messages from "../messages.js";
import type * as messaging from "../messaging.js";
import type * as orders from "../orders.js";
import type * as prices from "../prices.js";
import type * as recordings from "../recordings.js";
import type * as transcription from "../transcription.js";
import type * as transcripts from "../transcripts.js";

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
  disputes: typeof disputes;
  http: typeof http;
  "lib/phone": typeof lib_phone;
  "lib/stt": typeof lib_stt;
  "lib/twilio": typeof lib_twilio;
  "lib/wav": typeof lib_wav;
  messages: typeof messages;
  messaging: typeof messaging;
  orders: typeof orders;
  prices: typeof prices;
  recordings: typeof recordings;
  transcription: typeof transcription;
  transcripts: typeof transcripts;
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
