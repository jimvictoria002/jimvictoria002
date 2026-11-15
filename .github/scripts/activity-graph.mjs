// Draws the "Contribution Graph" line chart (last 31 days) that the
// github-readme-activity-graph service used to serve, in its react-dark
// colours. No dependencies: Node 20+ fetch + the Actions GITHUB_TOKEN.
// Usage: GITHUB_TOKEN=... node activity-graph.mjs <user> <out.svg> ["Display Name"]
import { writeFileSync } from "node:fs";

const [user, out, nameArg] = process.argv.slice(2);
const DAYS = 31;
const C = { bg: "#0d1117", main: "#5bcdec", point: "#ffffff", grid: "#5bcdec33" };

const query = `query($login:String!){user(login:$login){name contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!json.data?.user) throw new Error(`GraphQL error: ${JSON.stringify(json.errors ?? json)}`);
const days = json.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .slice(-DAYS);
const name = nameArg || json.data.user.name || user;

// Layout (matches the original 1200×420 card).
const W = 1200, H = 420, L = 80, R = 30, T = 70, B = 70;
const max = Math.max(4, ...days.map((d) => d.contributionCount));
const step = Math.ceil(max / 8 / (max > 40 ? 5 : 1)) * (max > 40 ? 5 : 1);
const top = Math.ceil(max / step) * step;
const x = (i) => L + (i * (W - L - R)) / (days.length - 1);
const y = (v) => H - B - (v / top) * (H - T - B);
const pts = days.map((d, i) => [x(i), y(d.contributionCount)]);

// Smooth curve (Catmull-Rom → cubic Bézier), clamped so it never dips below 0.
const floor = y(0);
const path = pts.reduce((acc, p, i, a) => {
  if (i === 0) return `M${p[0]},${p[1]}`;
  const p0 = a[i - 2] ?? a[i - 1], p1 = a[i - 1], p3 = a[i + 1] ?? p;
  const c1 = [p1[0] + (p[0] - p0[0]) / 6, Math.min(floor, p1[1] + (p[1] - p0[1]) / 6)];
  const c2 = [p[0] - (p3[0] - p1[0]) / 6, Math.min(floor, p[1] - (p3[1] - p1[1]) / 6)];
  return `${acc} C${c1.join(",")} ${c2.join(",")} ${p.join(",")}`;
}, "");
const area = `${path} L${x(days.length - 1)},${floor} L${x(0)},${floor} Z`;

const yTicks = Array.from({ length: top / step + 1 }, (_, k) => k * step);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const font = `font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif"`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="6" fill="${C.bg}"/>
<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.main}" stop-opacity=".35"/><stop offset="1" stop-color="${C.main}" stop-opacity="0"/></linearGradient></defs>
<text x="${W / 2}" y="42" text-anchor="middle" fill="${C.main}" font-size="22" font-weight="600" ${font}>${esc(name)}'s Contribution Graph</text>
${yTicks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/><text x="${L - 12}" y="${y(v) + 5}" text-anchor="end" fill="${C.main}" font-size="14" ${font}>${v}</text>`).join("\n")}
${days.map((d, i) => `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${floor}" stroke="${C.grid}" stroke-dasharray="3 4"/><text x="${x(i)}" y="${floor + 24}" text-anchor="middle" fill="${C.main}" font-size="14" ${font}>${Number(d.date.slice(8))}</text>`).join("\n")}
<text x="${(L + W - R) / 2}" y="${H - 14}" text-anchor="middle" fill="${C.main}" font-size="15" font-weight="600" ${font}>Days</text>
<text transform="translate(26 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" fill="${C.main}" font-size="15" font-weight="600" ${font}>Contributions</text>
<path d="${area}" fill="url(#fill)"/>
<path d="${path}" fill="none" stroke="${C.main}" stroke-width="4" stroke-linecap="round"/>
${pts.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="6" fill="${C.point}"><title>${days[i].date}: ${days[i].contributionCount}</title></circle>`).join("\n")}
</svg>`;

writeFileSync(out, svg);
console.log(`wrote ${out}: ${days[0].date} → ${days.at(-1).date}, max ${max}`);
