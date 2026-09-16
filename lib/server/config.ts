import { z } from "zod";

export const configSchema = z.object({
  modules: z.object({
    snippets: z.object({ enabled: z.boolean() }),
    files: z.object({
      enabled: z.boolean(),
      maxSizeMb: z.number().int().positive(),
    }),
    links: z.object({ enabled: z.boolean() }),
    board: z.object({ enabled: z.boolean() }),
  }),
  exposure: z.object({
    mode: z.enum(["lan", "public", "hybrid"]),
    domain: z.string().nullable(),
    https: z.object({
      mode: z.enum(["off", "auto"]),
      provider: z.literal("letsencrypt"),
    }),
  }),
  auth: z.object({
    mode: z.enum(["none", "required"]),
    sessionLengthHours: z.number().int().positive(),
  }),
  objects: z.object({
    defaultLifetime: z.string(),
    allowPerObjectOverride: z.boolean(),
    trashRetentionDays: z.number().int().nonnegative(),
  }),
  interface: z.object({
    theme: z.enum(["system", "dark", "light"]),
    layout: z.enum(["grid", "list", "terminal"]),
  }),
  cli: z.object({ enabled: z.boolean() }),
  api: z.object({ publicApi: z.boolean() }),
});

export type NineTConfig = z.infer<typeof configSchema>;

export const defaultConfig: NineTConfig = {
  modules: {
    snippets: { enabled: true },
    files: { enabled: true, maxSizeMb: 500 },
    links: { enabled: false },
    board: { enabled: false },
  },
  exposure: {
    mode: "lan",
    domain: null,
    https: { mode: "off", provider: "letsencrypt" },
  },
  auth: { mode: "none", sessionLengthHours: 168 },
  objects: {
    defaultLifetime: "forever",
    allowPerObjectOverride: true,
    trashRetentionDays: 7,
  },
  interface: { theme: "system", layout: "grid" },
  cli: { enabled: true },
  api: { publicApi: false },
};

export function validateConfig(config: NineTConfig) {
  const violations: { field: string; code: string; message: string }[] = [];
  if (config.exposure.mode !== "lan" && config.auth.mode === "none") {
    violations.push({
      field: "auth.mode",
      code: "auth_required_when_exposed",
      message:
        "auth.mode cannot be 'none' while exposure.mode is 'public' or 'hybrid'",
    });
  }
  return violations;
}
