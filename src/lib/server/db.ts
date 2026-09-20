// Storage backend selection. JSON files remain the default; setting
// NINE_T_DATABASE_URL selects Postgres (schema via `npm run migrate`).
// Routes import from here so neither backend leaks into request handlers.
import * as json from "./store";
import * as pgBackend from "./pg-store";

export type {
  ApiToken,
  AppConfig,
  Data,
  NineTObject,
  ObjectType,
  Share,
} from "./store";

const usePg = !!process.env.NINE_T_DATABASE_URL;
const backend = usePg ? pgBackend : json;

export const readData = backend.readData.bind(backend);
export const mutate = backend.mutate.bind(backend);
export const addObject = backend.addObject.bind(backend);
export const purgeObject = backend.purgeObject.bind(backend);
export const sweepExpired = backend.sweepExpired.bind(backend);

export { uploadDir } from "./store";
