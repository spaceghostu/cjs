/**
 * `/[module=module]` matches a catalogue key and nothing else.
 *
 * Without this the module route would swallow every unmatched path in the shell and turn a
 * genuine 404 into a locked-module page — a business asking for `/invoicing` that reached
 * `/invocing` would be told it needs to add a module it already owns.
 *
 * The matcher reads the catalogue, so a new module needs no change here.
 */
import { isModuleKey } from '$lib/core/modules/catalogue';
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => isModuleKey(param);
