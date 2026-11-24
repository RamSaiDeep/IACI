/**
 * Calls every Ask tool for a sample place and prints the JSON.
 *   npm run ask:tools
 */
import { runTool } from "../src/lib/ask/tools";

const show = (name: string, args: Record<string, unknown>) => {
  console.log(`\n=== ${name} ${JSON.stringify(args)}`);
  const out = JSON.stringify(runTool(name, args), null, 1);
  console.log(out.length > 1800 ? out.slice(0, 1800) + "\n ...(truncated)" : out);
};

const guntur = (runTool("resolve_place", { name: "Guntur", country: "india" }) as { matches: { id: string }[] }).matches[0].id;
const chennai = (runTool("resolve_place", { name: "Chennai", country: "india" }) as { matches: { id: string }[] }).matches[0].id;

show("resolve_place", { name: "Gurgaon" });
show("get_series", { place_id: guntur, components: ["composite", "rainfall"], period: { year: 2024 }, freq: "monthly" });
show("get_annual_summary", { place_id: guntur, year: 2024 });
show("get_month_summary", { place_id: guntur, year: 2024, month: 9 });
show("trend", { place_id: guntur, component: "drought" });
show("compare_places", { place_ids: [guntur, chennai], period: { from_year: 2015, to_year: 2025 } });
show("rank_places", { country: "india", region: "Odisha", component: "rainfall", period: { year: 2024, season: "monsoon" }, limit: 5 });
show("neighbours", { place_id: guntur });
show("get_methodology_facts", { country: "india" });
