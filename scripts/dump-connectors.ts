import { fetchConnectors } from "../lib/integrations/pluggy";
import { promises as fs } from "fs";

async function main() {
  try {
    console.log("Buscando dicionário de conectores...");
    const data = await fetchConnectors({ sandbox: false });
    const mapping = (data.results || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl
    }));
    
    await fs.writeFile("data/pluggy_connectors_map.json", JSON.stringify(mapping, null, 2));
    console.log(`Sucesso! ${mapping.length} conectores mapeados.`);
    console.log("Amostra dos 10 primeiros:");
    console.table(mapping.slice(0, 10));
  } catch (error) {
    console.error("Erro:", error);
  }
}

main();
