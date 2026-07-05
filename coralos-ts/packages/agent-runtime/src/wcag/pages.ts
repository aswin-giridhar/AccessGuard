/**
 * Page resolution — turn a WANT `arg` (a single hyphenated token, per the wire format)
 * into the baseline HTML both the seller and the verifier audit.
 *
 * Both sides call `resolvePage(arg)` and get the SAME source (like the txodds example,
 * where seller and verifier both read the same verified TxLine data). Bundled fixtures
 * are fully deterministic; an http(s) arg fetches a live page.
 */

// Seeded local-government pages with known accessibility barriers (keys are the WANT args).
export const FIXTURES: Record<string, string> = {
  'council-parking': `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h1>Resident Parking Permit</h1>
<h3>How to apply</h3>
<img src="council-logo.png">
<p style="color:#9a9a9a; background-color:#ffffff;">Apply below. Processed within 5 working days.</p>
<form action="/apply" method="post">
  <input type="text" name="full-name" placeholder="Full name">
  <input type="email" name="email" placeholder="Email address">
  <button></button>
</form>
<p>Need help? <a href="/contact"></a></p>
</body></html>`,

  'nhs-appointment': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Book appointment</title></head><body>
<h1>Book a GP Appointment</h1>
<h3>Before you book</h3>
<img src="nhs-banner.jpg">
<form action="/book">
  <input type="text" name="nhs-number" placeholder="NHS number">
  <select name="clinic"><option>Choose clinic</option></select>
  <button></button>
</form>
<p style="color:#bdbdbd; background-color:#f0f0f0;">Cancellations must be made 24 hours in advance.</p>
</body></html>`,

  'tax-portal': `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>
<h1>Council Tax Portal</h1>
<h3>Your account</h3>
<p style="color:#c0c0c0; background-color:#ffffff;">View your band and set up a direct debit.</p>
<form action="/pay">
  <input type="text" name="account-number" placeholder="Account number">
  <button></button>
</form>
<a href="/appeal"></a>
</body></html>`,

  // 中文公共服務頁面 (Traditional) — a Chinese-language gov service page. Note lang="en" on
  // Chinese content: a real barrier for zh screen-reader users that the CJK-aware check catches;
  // remediation should suggest zh-Hant given the Traditional characters.
  'city-services-zh': `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>
<h1>市政線上服務</h1>
<p>歡迎使用市民線上服務平台。</p>
<img src="city-logo.png">
<p style="color:#9a9a9a; background-color:#ffffff;">請填寫下方表單提出申請，五個工作天內處理完成。</p>
<form action="/apply" method="post">
  <input type="text" name="full-name" placeholder="姓名">
  <input type="email" name="email" placeholder="電子郵件">
  <button></button>
</form>
<p>需要協助嗎？<a href="/contact"></a></p>
</body></html>`,

  // 中文公共服务页面 (Simplified) — same page in Simplified Chinese; remediation should suggest zh-Hans.
  'city-services-hans': `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>
<h1>市政在线服务</h1>
<p>欢迎使用市民在线服务平台。</p>
<img src="city-logo.png">
<p style="color:#9a9a9a; background-color:#ffffff;">请填写下方表单提出申请，五个工作日内处理完成。</p>
<form action="/apply" method="post">
  <input type="text" name="full-name" placeholder="姓名">
  <input type="email" name="email" placeholder="电子邮件">
  <button></button>
</form>
<p>需要帮助吗？<a href="/contact"></a></p>
</body></html>`,
}

const DEFAULT_KEY = 'council-parking'

export async function resolvePage(arg: string): Promise<string> {
  const a = (arg || '').trim()
  if (/^https?:\/\//i.test(a)) {
    const res = await fetch(a, { headers: { 'User-Agent': 'AccessGuardExchange/0.1' } })
    if (!res.ok) throw new Error(`fetch ${a} -> ${res.status}`)
    return await res.text()
  }
  return FIXTURES[a] ?? FIXTURES[DEFAULT_KEY]
}

export function fixtureKeys(): string[] {
  return Object.keys(FIXTURES)
}
