// Raw feature inputs of each hand-built family (also used to drop a family's inputs from D).
export const FAMILY_INPUTS = Object.freeze({
  A: ['resid_mom', 'resid_mom_vs'],
  B: ['sue', 'gp_chg'],
  C: ['gpa', 'ebit_ev', 'fcf_yield', 'bm_adj'],
});
export const FAMILY_INPUTS_C = FAMILY_INPUTS.C;
