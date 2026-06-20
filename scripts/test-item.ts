import { fetchItem } from "../lib/integrations/pluggy";
async function run() {
  const item = await fetchItem("555c9e9e-6858-4c0a-9a84-493c48a78a38");
  console.log(JSON.stringify(item, null, 2));
}
run();