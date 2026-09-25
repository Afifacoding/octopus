import type { ProjectColor } from './types';

export function buildCreateProjectInput(input: {
  name: string;
  description: string;
  color: ProjectColor | null;
}) {
  const trimmedDescription = input.description.trim();

  return {
    name: input.name,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    ...(input.color ? { color: input.color } : {}),
  };
}

export function buildUpdateProjectInput(input: {
  name: string;
  description: string;
  color: ProjectColor | null;
}) {
  return {
    name: input.name,
    description: input.description,
    color: input.color,
  };
}

export function resolveEditProjectColor(color: ProjectColor | null | undefined) {
  return color ?? null;
}
