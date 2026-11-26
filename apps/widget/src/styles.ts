import { css } from "lit";

/**
 * Shadow DOM keeps the gym website's CSS out (and ours in). Themeable from the page with
 * --gym-primary, --gym-radius and --gym-font; the gym's brand colour is the default primary.
 */
export const base = css`
  :host {
    display: block;
    font-family: var(--gym-font, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif);
    font-size: 16px;
    line-height: 1.5;
    color: #0f172a;
    --p: var(--gym-primary, var(--gym-brand, #2563eb));
    --r: var(--gym-radius, 8px);
  }
  * {
    box-sizing: border-box;
  }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: var(--r);
    padding: 16px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  .muted {
    color: #64748b;
    font-size: 14px;
  }
  button {
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    border-radius: var(--r);
    border: 1px solid transparent;
    padding: 8px 14px;
    cursor: pointer;
    min-height: 40px;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--p);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    background: var(--p);
    color: #fff;
  }
  .secondary {
    background: #fff;
    color: #0f172a;
    border-color: #e2e8f0;
  }
  .link {
    background: none;
    color: var(--p);
    padding: 4px 0;
    min-height: 0;
  }
  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 6px;
  }
  input,
  textarea {
    font: inherit;
    width: 100%;
    border: 1px solid #e2e8f0;
    border-radius: var(--r);
    padding: 8px 12px;
    min-height: 40px;
    background: #fff;
  }
  .field {
    margin-bottom: 12px;
  }
  .notice {
    padding: 10px 12px;
    border-radius: var(--r);
    font-size: 14px;
    margin-bottom: 12px;
  }
  .ok {
    background: #f0fdf4;
    color: #15803d;
  }
  .err {
    background: #fef2f2;
    color: #b91c1c;
  }
  .powered {
    margin-top: 12px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
`;
