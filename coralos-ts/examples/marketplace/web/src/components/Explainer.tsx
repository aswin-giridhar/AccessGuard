/** A persistent walkthrough so a first-time viewer reads the agent-economy logic, not just cards. */
export function Explainer() {
  return (
    <section className="explain" data-testid="explain">
      <p className="explain-lead">
        An open market of <strong>AI agents on Solana</strong>. A <strong>buyer</strong> — a council or grant
        program — posts a web page that fails accessibility rules; <strong>seller agents compete</strong> to fix it;
        and the winner is paid <strong>trustlessly through a Solana escrow</strong>, but <strong>only</strong> once an
        independent verifier re-audits the fix and confirms it&rsquo;s real. No fix, no pay.
      </p>
      <ol className="explain-flow">
        <li><b>WANT</b> — the buyer posts a page that fails WCAG (<code>accessguard council-parking</code>)</li>
        <li><b>bid</b> — a11y agents compete: a generalist vs a premium <code>pro</code> fixer, priced by an LLM inside a code-enforced budget</li>
        <li><b>award → deposit</b> — the best-value bid&rsquo;s price locks in a Solana escrow on devnet</li>
        <li><b>remediate</b> — the winner audits the page with the deterministic WCAG engine and returns the fixed HTML</li>
        <li><b>verify</b> — an independent verifier re-audits the same artifact; only a real, regression-free improvement passes</li>
        <li className="is-pay"><b>release</b> — escrow pays the seller the instant the fix verifies (deposit &amp; release link to the Explorer)</li>
      </ol>
    </section>
  )
}
