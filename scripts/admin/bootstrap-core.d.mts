export type BootstrapInput = {
  name: string;
  email: string;
  password: string;
};

export class BootstrapError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function validateBootstrapInput(input: BootstrapInput): BootstrapInput;

export function bootstrapFirstAdmin(
  client: {
    query: (query: string, values?: unknown[]) => Promise<{
      rowCount: number | null;
    }>;
  },
  input: BootstrapInput,
): Promise<{ id: string }>;
