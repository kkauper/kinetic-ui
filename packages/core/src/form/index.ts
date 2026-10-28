import { defineSchema } from './schema';
import signupJson from './signup.schema.json';

export * from './schema';
export * from './validation';
export * from './persistence';
export * from './model';
export * from './email';

/** The demo sign-up form, validated at load time. */
export const signupSchema = defineSchema(signupJson);
