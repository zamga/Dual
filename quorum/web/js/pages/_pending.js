// Placeholder for routes owned by the next web builders. Each stub file re-exports this render;
// replace the stub with the real page module (same file name) to take the route over.
import { render as notFound } from './not-found.js';

export async function render(ctx) {
  return notFound(ctx, { pending: true });
}
