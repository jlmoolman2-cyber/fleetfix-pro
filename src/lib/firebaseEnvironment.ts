export const FIREBASE_PROJECT_IDS = {
  production: "fleetfix-pro",
  staging: "fleetfix-pro-staging",
} as const;

export type FleetFixEnvironment = keyof typeof FIREBASE_PROJECT_IDS;

export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type FirebasePublicConfigInput = Partial<FirebasePublicConfig> & {
  environment?: string;
};

const PUBLIC_CONFIG_FIELDS: ReadonlyArray<keyof FirebasePublicConfig> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

export function resolveFleetFixEnvironment(value: string | undefined): FleetFixEnvironment {
  if (value === "production" || value === "staging") return value;
  throw new Error(
    "Firebase configuration error: NEXT_PUBLIC_FLEETFIX_ENVIRONMENT must be explicitly set to 'production' or 'staging'.",
  );
}

export function assertExpectedFirebaseProject(
  environment: FleetFixEnvironment,
  projectId: string | undefined,
  source: string,
): string {
  const expectedProjectId = FIREBASE_PROJECT_IDS[environment];
  if (!projectId) {
    throw new Error(`Firebase configuration error: ${source} is required.`);
  }
  if (projectId !== expectedProjectId) {
    throw new Error(
      `Firebase configuration error: ${environment} must target '${expectedProjectId}', but ${source} targets '${projectId}'.`,
    );
  }
  return projectId;
}

export function resolveFirebasePublicConfig(input: FirebasePublicConfigInput): FirebasePublicConfig {
  const environment = resolveFleetFixEnvironment(input.environment);
  const missing = PUBLIC_CONFIG_FIELDS.filter((field) => !input[field]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Firebase configuration error: missing required public Firebase configuration: ${missing.join(", ")}.`,
    );
  }

  const config = input as FirebasePublicConfig;
  assertExpectedFirebaseProject(environment, config.projectId, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  return config;
}

type ServerFirebaseEnvironment = Record<string, string | undefined>;

function projectIdFromFirebaseConfig(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { projectId?: unknown };
    return typeof parsed.projectId === "string" ? parsed.projectId : undefined;
  } catch {
    throw new Error("Firebase configuration error: FIREBASE_CONFIG is not valid JSON.");
  }
}

export function resolveServerFirebaseProject(environment: ServerFirebaseEnvironment): string {
  const deploymentEnvironment = resolveFleetFixEnvironment(
    environment.FLEETFIX_ENVIRONMENT || environment.NEXT_PUBLIC_FLEETFIX_ENVIRONMENT,
  );
  const candidates = [
    ["GOOGLE_CLOUD_PROJECT", environment.GOOGLE_CLOUD_PROJECT],
    ["GCLOUD_PROJECT", environment.GCLOUD_PROJECT],
    ["FIREBASE_CONFIG.projectId", projectIdFromFirebaseConfig(environment.FIREBASE_CONFIG)],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID],
  ] as const;
  if (!candidates.some(([, projectId]) => Boolean(projectId))) {
    throw new Error(
      "Firebase configuration error: the server Firebase project could not be resolved from GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, FIREBASE_CONFIG, or NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
    );
  }

  for (const [source, projectId] of candidates) {
    if (projectId) assertExpectedFirebaseProject(deploymentEnvironment, projectId, source);
  }

  return FIREBASE_PROJECT_IDS[deploymentEnvironment];
}
