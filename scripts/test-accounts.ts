import { fetchAccounts } from "../lib/integrations/pluggy";
async function run() {
  const data = await fetchAccounts({ itemId: "555c9e9e-6858-4c0a-9a84-493c48a78a38" });
  console.log(JSON.stringify(data, null, 2));
}
run();