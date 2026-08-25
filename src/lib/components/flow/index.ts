/**
 * MULTI-STEP FLOWS. The shape every long, interruptible, money-touching task takes.
 *
 * T24 describes the stock count as "the pattern-setter": a flow where progress is visible,
 * nothing commits until it has been reviewed, and walking away loses nothing. Pay runs, VAT
 * returns and bank reconciliation are all the same shape. This directory is where the parts they
 * share live, so the fourth one is assembled rather than invented.
 *
 * Today that is one component. That is not an argument against the directory — it is the whole
 * argument for it: a stepper that had been written inside `components/inventory` would have to be
 * moved, renamed and re-styled by whoever wrote the pay run, and it would not be.
 */
export { default as Stepper } from './Stepper.svelte';
